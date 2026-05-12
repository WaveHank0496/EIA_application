import os
import re
import json
import base64
import requests
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, request, jsonify

load_dotenv()
from flask_cors import CORS
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

app = Flask(__name__)
# 僅開放 GitHub Pages，防止其他來源偽造 CORS 預檢通過
CORS(app, origins=["https://wavehank0496.github.io"])

# UUID v4：version nibble 固定為 4，variant bits 固定為 8/9/a/b
UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.IGNORECASE,
)
VALID_SHOPS = {'shop_1', 'shop_2', 'shop_3', 'shop_4', 'shop_5'}


def get_key() -> bytes:
    secret = os.environ.get("SECRET_KEY")
    if not secret:
        raise RuntimeError("SECRET_KEY environment variable is not set")
    return bytes.fromhex(secret)


# ── Cloudflare KV helpers ──────────────────────────────────────────────────

def _cf_url(key: str) -> str:
    """Build the Cloudflare KV REST endpoint URL for a given key."""
    account = os.environ["CF_ACCOUNT_ID"]
    ns = os.environ["CF_NAMESPACE_ID"]
    return (
        f"https://api.cloudflare.com/client/v4/accounts/{account}"
        f"/storage/kv/namespaces/{ns}/values/{key}"
    )


def _cf_headers() -> dict:
    return {"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"}


def kv_get(key: str):
    """
    Fetch a KV value.
    Returns the raw string value, or None if the key does not exist.
    Raises on any non-404 HTTP error so callers can return 500.
    """
    resp = requests.get(_cf_url(key), headers=_cf_headers(), timeout=10)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.text


def kv_put(key: str, value: str) -> None:
    """
    Store a string value in KV.
    Raises on HTTP error so callers can return 500.
    """
    resp = requests.put(
        _cf_url(key),
        headers={**_cf_headers(), "Content-Type": "application/json"},
        data=value.encode(),
        timeout=10,
    )
    resp.raise_for_status()


# ── Business logic ─────────────────────────────────────────────────────────

def calculate_target_total(stamped_count: int) -> int:
    """
    3 章 1 顆、6 章 2 顆、9 章 3 顆。
    Named function so the formula is visible to the firmware team in one place.
    """
    return stamped_count // 3


# ── API endpoints ──────────────────────────────────────────────────────────

@app.get("/api/shop")
def get_shop():
    """Validate a shop QR token and return its shop_id. Unchanged from original."""
    token = request.args.get("token")
    if not token:
        return jsonify({"error": "missing_token"}), 400

    shop_map = {
        os.environ.get("SHOP_TOKEN_1"): "shop_1",
        os.environ.get("SHOP_TOKEN_2"): "shop_2",
        os.environ.get("SHOP_TOKEN_3"): "shop_3",
        os.environ.get("SHOP_TOKEN_4"): "shop_4",
        os.environ.get("SHOP_TOKEN_5"): "shop_5",
    }

    shop_id = shop_map.get(token)
    if not shop_id:
        return jsonify({"error": "invalid_token"}), 404

    return jsonify({"shop_id": shop_id})


@app.post("/api/stamp")
def stamp():
    """
    Write a stamp to Cloudflare KV.
    Idempotent: re-stamping the same shop only updates the timestamp,
    so retrying on network failure is safe.
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "請求格式錯誤"}), 400

    card_id = body.get("card_id", "")
    shop_id = body.get("shop_id", "")

    if not UUID_RE.match(card_id):
        return jsonify({"error": "無效的集點卡 ID"}), 400
    if shop_id not in VALID_SHOPS:
        return jsonify({"error": "無效的店家 ID"}), 400

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        raw = kv_get(f"card:{card_id}")
    except Exception:
        return jsonify({"error": "讀取集點資料失敗，請稍後再試"}), 500

    if raw is None:
        # First stamp ever: create the card record in KV
        card = {"stamps": {}, "created_at": now, "last_updated": now}
    else:
        try:
            card = json.loads(raw)
        except Exception:
            return jsonify({"error": "集點資料損毀"}), 500

    card["stamps"][shop_id] = {"stamped": True, "timestamp": now}
    card["last_updated"] = now

    try:
        kv_put(f"card:{card_id}", json.dumps(card))
    except Exception:
        return jsonify({"error": "儲存集點資料失敗，請稍後再試"}), 500

    stamped_count = sum(
        1 for v in card["stamps"].values()
        if isinstance(v, dict) and v.get("stamped") is True
    )
    return jsonify({"success": True, "stamped_count": stamped_count})


@app.post("/api/sign")
def sign():
    """
    Generate a redemption QR Code payload.
    Reads stamps from KV (not from the client) so the count cannot be faked.
    Payload includes target_total for idempotent firmware redemption:
    firmware computes (target_total - already_dispensed) = balls to dispense.
    Keeps the same AES-256-GCM wire format because the firmware team already
    has the decryption template.
    """
    body = request.get_json(silent=True)
    if not body or "card_id" not in body:
        return jsonify({"error": "missing_card_id"}), 400

    card_id = body["card_id"]
    if not UUID_RE.match(card_id):
        return jsonify({"error": "無效的集點卡 ID"}), 400

    try:
        raw = kv_get(f"card:{card_id}")
    except Exception:
        return jsonify({"error": "讀取集點資料失敗，請稍後再試"}), 500

    if raw is None:
        return jsonify({"error": "insufficient_stamps"}), 400

    try:
        card = json.loads(raw)
    except Exception:
        return jsonify({"error": "集點資料損毀"}), 500

    stamps = card.get("stamps", {})
    stamped_count = sum(
        1 for v in stamps.values()
        if isinstance(v, dict) and v.get("stamped") is True
    )
    target_total = calculate_target_total(stamped_count)
    if target_total == 0:
        return jsonify({"error": "insufficient_stamps"}), 400

    payload = {
        "stamps": stamps,
        "card_id": card_id,
        "target_total": target_total,
        "issued_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    key = get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    data = json.dumps(payload, sort_keys=True).encode()
    ciphertext = aesgcm.encrypt(nonce, data, None)
    qr_payload = base64.urlsafe_b64encode(nonce + ciphertext).decode()

    return jsonify({"qr_payload": qr_payload})


@app.post("/api/get_card")
def get_card():
    """
    Cross-browser card recovery.
    Users who switch browsers enter their card_id UUID to restore progress
    without any login system.
    """
    body = request.get_json(silent=True)
    if not body or "card_id" not in body:
        return jsonify({"error": "missing_card_id"}), 400

    card_id = body["card_id"]
    if not UUID_RE.match(card_id):
        return jsonify({"error": "無效的集點卡 ID"}), 400

    try:
        raw = kv_get(f"card:{card_id}")
    except Exception:
        return jsonify({"error": "讀取集點資料失敗，請稍後再試"}), 500

    if raw is None:
        return jsonify({"error": "card_not_found"}), 404

    try:
        card = json.loads(raw)
    except Exception:
        return jsonify({"error": "集點資料損毀"}), 500

    stamps = card.get("stamps", {})
    stamped_count = sum(
        1 for v in stamps.values()
        if isinstance(v, dict) and v.get("stamped") is True
    )
    return jsonify({
        "card_id": card_id,
        "stamps": stamps,
        "created_at": card.get("created_at", ""),
        "stamped_count": stamped_count,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
