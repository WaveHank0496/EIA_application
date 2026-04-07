import os
import json
import base64
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from flask import Flask, request, jsonify

load_dotenv()
from flask_cors import CORS
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

app = Flask(__name__)
CORS(app, origins=["https://yourname.github.io"])


def get_key() -> bytes:
    secret = os.environ.get("SECRET_KEY")
    if not secret:
        raise RuntimeError("SECRET_KEY environment variable is not set")
    return bytes.fromhex(secret)


@app.post("/api/sign")
def sign():
    body = request.get_json(silent=True)
    if not body or "stamps" not in body:
        return jsonify({"error": "missing_stamps"}), 400

    stamps = body["stamps"]
    stamped_count = sum(
        1 for v in stamps.values() if isinstance(v, dict) and v.get("stamped") is True
    )
    if stamped_count < 3:
        return jsonify({"error": "insufficient_stamps"}), 400

    payload = {
        "stamps": stamps,
        "issued_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    key = get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    data = json.dumps(payload, sort_keys=True).encode()
    ciphertext = aesgcm.encrypt(nonce, data, None)
    qr_payload = base64.urlsafe_b64encode(nonce + ciphertext).decode()

    return jsonify({"qr_payload": qr_payload})


@app.get("/api/verify")
def verify():
    encoded = request.args.get("data", "")
    if not encoded:
        return jsonify({"valid": False, "reason": "invalid_ciphertext"}), 400

    # Decode and decrypt
    try:
        raw = base64.urlsafe_b64decode(encoded + "==")  # padding tolerance
        if len(raw) < 13:
            raise ValueError("payload too short")
        nonce, ciphertext = raw[:12], raw[12:]
        key = get_key()
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        payload = json.loads(plaintext)
    except (InvalidTag, ValueError, Exception):
        return jsonify({"valid": False, "reason": "invalid_ciphertext"}), 400

    # Check expiry (5-minute window)
    try:
        issued_at = datetime.strptime(payload["issued_at"], "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc
        )
    except (KeyError, ValueError):
        return jsonify({"valid": False, "reason": "invalid_ciphertext"}), 400

    if datetime.now(timezone.utc) - issued_at > timedelta(minutes=5):
        return jsonify({"valid": False, "reason": "expired"}), 400

    # Check stamp count
    stamps = payload.get("stamps", {})
    stamped_count = sum(
        1 for v in stamps.values() if isinstance(v, dict) and v.get("stamped") is True
    )
    if stamped_count < 3:
        return jsonify({"valid": False, "reason": "insufficient_stamps"}), 400

    return jsonify({"valid": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
