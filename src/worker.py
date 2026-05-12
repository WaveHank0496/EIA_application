import json
import os
import base64
import re
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from workers import WorkerEntrypoint, Response

# 8 字元大寫英數字，前端 generateCardId() 也用同一組字符
CARD_ID_RE = re.compile(r'^[A-Z0-9]{8}$')
VALID_SHOPS = {'shop_1', 'shop_2', 'shop_3', 'shop_4', 'shop_5'}

# 店家對照表（未來可用於回傳店家名稱）
SHOP_CATALOG = {
    "shop_1": "店家A",
    "shop_2": "店家B",
    "shop_3": "店家C",
    "shop_4": "店家D",
    "shop_5": "店家E",
}

# 每個 response 都帶這組 headers，CORS 嚴格限定 GitHub Pages origin
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://wavehank0496.github.io",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
}


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def json_response(data: dict, status: int = 200) -> Response:
    return Response(
        json.dumps(data, ensure_ascii=False),
        status=status,
        headers=CORS_HEADERS,
    )


def calculate_target_total(stamped_count: int) -> int:
    """3 章 1 顆、6 章 2 顆、9 章 3 顆。
    Named function so the firmware team can reference the same formula."""
    return stamped_count // 3


class Default(WorkerEntrypoint):

    async def fetch(self, request):
        # CORS preflight must be answered before route dispatch
        if request.method == "OPTIONS":
            return Response("", status=204, headers=CORS_HEADERS)

        url = urlparse(str(request.url))
        path = url.path
        method = request.method

        if path == "/api/shop" and method == "GET":
            return await self.handle_shop(url)
        if path == "/api/stamp" and method == "POST":
            return await self.handle_stamp(request)
        if path == "/api/sign" and method == "POST":
            return await self.handle_sign(request)
        if path == "/api/get_card" and method == "POST":
            return await self.handle_get_card(request)

        return Response("Not Found", status=404)

    # ── /api/shop ──────────────────────────────────────────────────────────────

    async def handle_shop(self, url) -> Response:
        """Validate a shop QR token and return its shop_id."""
        params = parse_qs(url.query)
        token_list = params.get("token")
        if not token_list:
            return json_response({"error": "missing_token"}, 400)
        token = token_list[0]

        shop_map = {
            self.env.SHOP_TOKEN_1: "shop_1",
            self.env.SHOP_TOKEN_2: "shop_2",
            self.env.SHOP_TOKEN_3: "shop_3",
            self.env.SHOP_TOKEN_4: "shop_4",
            self.env.SHOP_TOKEN_5: "shop_5",
        }
        shop_id = shop_map.get(token)
        if not shop_id:
            return json_response({"error": "invalid_token"}, 404)

        return json_response({"shop_id": shop_id})

    # ── /api/stamp ─────────────────────────────────────────────────────────────

    async def handle_stamp(self, request) -> Response:
        """Write a stamp to KV. Idempotent: re-stamping the same shop
        updates the timestamp but doesn't double-count."""
        try:
            body = await request.json()
        except Exception:
            return json_response({"error": "請求格式錯誤"}, 400)

        card_id: str = body.get("card_id", "")
        shop_id: str = body.get("shop_id", "")

        if not CARD_ID_RE.match(card_id):
            return json_response({"error": "無效的集點卡 ID"}, 400)
        if shop_id not in VALID_SHOPS:
            return json_response({"error": "無效的店家 ID"}, 400)

        now = utcnow()

        try:
            raw = await self.env.STAMP_CARDS.get(f"card:{card_id}")
        except Exception:
            return json_response({"error": "讀取集點資料失敗，請稍後再試"}, 500)

        if raw is None:
            # First stamp: initialise the card record
            card: dict = {"stamps": {}, "created_at": now, "last_updated": None}
        else:
            try:
                card = json.loads(raw)
            except Exception:
                return json_response({"error": "集點資料損毀"}, 500)

        # stamps[shop_id] = ISO timestamp (simple, no nested dict needed)
        card["stamps"][shop_id] = now
        card["last_updated"] = now

        try:
            await self.env.STAMP_CARDS.put(f"card:{card_id}", json.dumps(card))
        except Exception:
            return json_response({"error": "儲存集點資料失敗，請稍後再試"}, 500)

        return json_response({"success": True, "stamped_count": len(card["stamps"])})

    # ── /api/sign ──────────────────────────────────────────────────────────────

    async def handle_sign(self, request) -> Response:
        """Generate a redemption QR Code payload.
        Reads stamps from KV — not from the client — so count cannot be faked.
        Payload includes target_total for idempotent firmware redemption:
        firmware computes (target_total - already_dispensed) = balls to give.
        Wire format is identical to the original Flask version so the firmware
        team's decryption template works unchanged."""
        try:
            body = await request.json()
        except Exception:
            return json_response({"error": "請求格式錯誤"}, 400)

        card_id: str = body.get("card_id", "")
        if not CARD_ID_RE.match(card_id):
            return json_response({"error": "無效的集點卡 ID"}, 400)

        try:
            raw = await self.env.STAMP_CARDS.get(f"card:{card_id}")
        except Exception:
            return json_response({"error": "讀取集點資料失敗，請稍後再試"}, 500)

        if raw is None:
            return json_response({"error": "card_not_found"}, 404)

        try:
            card = json.loads(raw)
        except Exception:
            return json_response({"error": "集點資料損毀"}, 500)

        stamps: dict = card.get("stamps", {})
        stamped_count = len(stamps)
        target_total = calculate_target_total(stamped_count)
        if target_total == 0:
            return json_response({"error": "insufficient_stamps"}, 400)

        payload = {
            "stamps": stamps,
            "card_id": card_id,
            "target_total": target_total,
            "issued_at": utcnow(),
        }

        key = bytes.fromhex(self.env.SECRET_KEY)
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)
        data = json.dumps(payload, sort_keys=True).encode()
        ciphertext = aesgcm.encrypt(nonce, data, None)
        # nonce prepended to ciphertext+tag — matches Flask app wire format
        qr_payload = base64.urlsafe_b64encode(nonce + ciphertext).decode()

        return json_response({"qr_payload": qr_payload})

    # ── /api/get_card ──────────────────────────────────────────────────────────

    async def handle_get_card(self, request) -> Response:
        """Cross-browser card recovery.
        Users who switch browsers enter their 8-char card_id to restore progress."""
        try:
            body = await request.json()
        except Exception:
            return json_response({"error": "請求格式錯誤"}, 400)

        card_id: str = body.get("card_id", "")
        if not CARD_ID_RE.match(card_id):
            return json_response({"error": "無效的集點卡 ID"}, 400)

        try:
            raw = await self.env.STAMP_CARDS.get(f"card:{card_id}")
        except Exception:
            return json_response({"error": "讀取集點資料失敗，請稍後再試"}, 500)

        if raw is None:
            return json_response({"error": "card_not_found"}, 404)

        try:
            card = json.loads(raw)
        except Exception:
            return json_response({"error": "集點資料損毀"}, 500)

        stamps: dict = card.get("stamps", {})
        return json_response({
            "card_id": card_id,
            "stamps": stamps,
            "created_at": card.get("created_at", ""),
            "stamped_count": len(stamps),
        })
