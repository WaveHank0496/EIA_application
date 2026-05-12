from workers import WorkerEntrypoint, Response
from js import crypto, Uint8Array
import json
import base64
import re
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

# 8 字元大寫英數字，與前端 generateCardId() 使用相同字符集
CARD_ID_RE = re.compile(r'^[A-Z0-9]{8}$')
VALID_SHOPS = {'shop_1', 'shop_2', 'shop_3', 'shop_4', 'shop_5'}

# 店家對照表（informational，供未來擴充）
SHOP_CATALOG = {
    "shop_1": "店家A",
    "shop_2": "店家B",
    "shop_3": "店家C",
    "shop_4": "店家D",
    "shop_5": "店家E",
}

# 嚴格限定 GitHub Pages origin，防止其他來源繞過 CORS
ALLOWED_ORIGIN = "https://wavehank0496.github.io"


async def encrypt_payload(payload_dict: dict, key_hex: str) -> str:
    """
    AES-256-GCM 加密，使用 Web Crypto API（Pyodide 環境無法裝 cryptography lib）。
    輸出格式：nonce(12 bytes) + ciphertext+tag(N+16 bytes)，base64 urlsafe 編碼。
    與原本 Python cryptography.AESGCM 的輸出格式完全相同，韌體端解密範本不需修改。
    """
    plaintext_bytes = json.dumps(payload_dict, sort_keys=True).encode()
    key_bytes = bytes.fromhex(key_hex)

    # 匯入 AES-256-GCM key
    key_buffer = Uint8Array.new(list(key_bytes))
    crypto_key = await crypto.subtle.importKey(
        "raw",
        key_buffer,
        {"name": "AES-GCM"},
        False,
        ["encrypt"],
    )

    # 產生 12 bytes 隨機 nonce（與 os.urandom(12) 等效）
    nonce_array = crypto.getRandomValues(Uint8Array.new(12))
    nonce_bytes = bytes(nonce_array.to_py())

    # 加密；Web Crypto 回傳的 ciphertext 已包含 16 bytes auth tag 在尾端
    plaintext_buffer = Uint8Array.new(list(plaintext_bytes))
    ciphertext_buffer = await crypto.subtle.encrypt(
        {"name": "AES-GCM", "iv": nonce_array},
        crypto_key,
        plaintext_buffer,
    )
    ciphertext_bytes = bytes(Uint8Array.new(ciphertext_buffer).to_py())

    combined = nonce_bytes + ciphertext_bytes
    return base64.urlsafe_b64encode(combined).decode()


class Default(WorkerEntrypoint):

    async def fetch(self, request):
        # CORS preflight 必須在路由分發前處理
        if request.method == "OPTIONS":
            return Response("", status=204, headers=self.cors_headers())

        url = urlparse(str(request.url))
        path = url.path
        method = request.method

        if path == "/api/shop" and method == "GET":
            return await self.handle_shop(request, url)
        if path == "/api/stamp" and method == "POST":
            return await self.handle_stamp(request)
        if path == "/api/sign" and method == "POST":
            return await self.handle_sign(request)
        if path == "/api/get_card" and method == "POST":
            return await self.handle_get_card(request)

        return Response("Not Found", status=404)

    # ── 共用 helper ────────────────────────────────────────────────────────────

    def cors_headers(self) -> dict:
        return {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }

    def json_response(self, data: dict, status: int = 200) -> Response:
        headers = {**self.cors_headers(), "Content-Type": "application/json"}
        return Response(
            json.dumps(data, ensure_ascii=False),
            status=status,
            headers=headers,
        )

    # ── /api/shop ──────────────────────────────────────────────────────────────

    async def handle_shop(self, request, url) -> Response:
        """Validate a shop QR token and return its shop_id."""
        params = parse_qs(url.query)
        token_list = params.get("token")
        if not token_list:
            return self.json_response({"error": "missing_token"}, 400)
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
            return self.json_response({"error": "invalid_token"}, 404)

        return self.json_response({"shop_id": shop_id})

    # ── /api/stamp ─────────────────────────────────────────────────────────────

    async def handle_stamp(self, request) -> Response:
        """Write a stamp to KV. Idempotent: re-stamping the same shop
        updates the timestamp but doesn't double-count."""
        try:
            body_text = await request.text()
            body = json.loads(body_text)
        except Exception:
            return self.json_response({"error": "請求格式錯誤"}, 400)

        card_id: str = body.get("card_id", "")
        shop_id: str = body.get("shop_id", "")

        if not CARD_ID_RE.match(card_id):
            return self.json_response({"error": "無效的集點卡 ID"}, 400)
        if shop_id not in VALID_SHOPS:
            return self.json_response({"error": "無效的店家 ID"}, 400)

        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        try:
            raw = await self.env.STAMP_CARDS.get("card:" + card_id)
        except Exception:
            return self.json_response({"error": "讀取集點資料失敗，請稍後再試"}, 500)

        if raw is None:
            # 第一次集點：建立集點卡記錄
            card: dict = {"stamps": {}, "created_at": now, "last_updated": None}
        else:
            try:
                card = json.loads(raw)
            except Exception:
                return self.json_response({"error": "集點資料損毀"}, 500)

        # stamps[shop_id] = ISO timestamp；重複蓋同家店只更新時間，不重複計數
        card["stamps"][shop_id] = now
        card["last_updated"] = now

        try:
            await self.env.STAMP_CARDS.put("card:" + card_id, json.dumps(card))
        except Exception:
            return self.json_response({"error": "儲存集點資料失敗，請稍後再試"}, 500)

        return self.json_response({"success": True, "stamped_count": len(card["stamps"])})

    # ── /api/sign ──────────────────────────────────────────────────────────────

    async def handle_sign(self, request) -> Response:
        """Generate a redemption QR Code payload.
        Reads stamps from KV (not from the client) so count cannot be faked.
        Payload includes target_total for idempotent firmware redemption:
        firmware computes (target_total - already_dispensed) = balls to give.
        Wire format is identical to the original Flask version so the firmware
        team's decryption template works unchanged."""
        try:
            body_text = await request.text()
            body = json.loads(body_text)
        except Exception:
            return self.json_response({"error": "請求格式錯誤"}, 400)

        card_id: str = body.get("card_id", "")
        if not CARD_ID_RE.match(card_id):
            return self.json_response({"error": "無效的集點卡 ID"}, 400)

        try:
            raw = await self.env.STAMP_CARDS.get("card:" + card_id)
        except Exception:
            return self.json_response({"error": "讀取集點資料失敗，請稍後再試"}, 500)

        if raw is None:
            return self.json_response({"error": "card_not_found"}, 404)

        try:
            card = json.loads(raw)
        except Exception:
            return self.json_response({"error": "集點資料損毀"}, 500)

        stamps: dict = card.get("stamps", {})
        stamped_count = len(stamps)
        target_total = stamped_count // 3  # 3 章 1 顆、6 章 2 顆、9 章 3 顆
        if target_total == 0:
            return self.json_response({"error": "insufficient_stamps"}, 400)

        payload = {
            "stamps": stamps,
            "card_id": card_id,
            "target_total": target_total,
            "issued_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        qr_payload = await encrypt_payload(payload, self.env.SECRET_KEY)

        return self.json_response({"qr_payload": qr_payload})

    # ── /api/get_card ──────────────────────────────────────────────────────────

    async def handle_get_card(self, request) -> Response:
        """Cross-browser card recovery.
        Users who switch browsers enter their 8-char card_id to restore progress."""
        try:
            body_text = await request.text()
            body = json.loads(body_text)
        except Exception:
            return self.json_response({"error": "請求格式錯誤"}, 400)

        card_id: str = body.get("card_id", "")
        if not CARD_ID_RE.match(card_id):
            return self.json_response({"error": "無效的集點卡 ID"}, 400)

        try:
            raw = await self.env.STAMP_CARDS.get("card:" + card_id)
        except Exception:
            return self.json_response({"error": "讀取集點資料失敗，請稍後再試"}, 500)

        if raw is None:
            return self.json_response({"error": "card_not_found"}, 404)

        try:
            card = json.loads(raw)
        except Exception:
            return self.json_response({"error": "集點資料損毀"}, 500)

        stamps: dict = card.get("stamps", {})
        return self.json_response({
            "card_id": card_id,
            "stamps": stamps,
            "created_at": card.get("created_at", ""),
            "stamped_count": len(stamps),
        })
