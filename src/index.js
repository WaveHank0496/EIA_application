// 嚴格限定 GitHub Pages origin，防止其他來源繞過 CORS
const ALLOWED_ORIGIN = "https://wavehank0496.github.io";

// 8 字元大寫英數字，與前端 generateCardId() 使用相同字符集
const CARD_ID_RE = /^[A-Z0-9]{8}$/;
const VALID_SHOPS = new Set(["shop_1", "shop_2", "shop_3", "shop_4", "shop_5"]);

// ── 共用 helper ────────────────────────────────────────────────────────────────

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

// 所有回應都帶 CORS header，前端才能讀到 body
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
}

// 產生與 Python strftime("%Y-%m-%dT%H:%M:%SZ") 相同格式的 UTC 時間字串
function nowISO() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ── 加密 helper ────────────────────────────────────────────────────────────────

// hex 字串 → Uint8Array（用於從 SECRET_KEY 還原 32 bytes key）
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
}

// Uint8Array → base64 urlsafe（保留 = padding，與 Python urlsafe_b64encode 完全一致）
function toBase64Url(bytes) {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

// 遞迴排序物件鍵（對應 Python json.dumps(sort_keys=True)）
// 韌體端用 key 名稱存取值，理論上順序無關緊要，但保持一致以利除錯比對
function sortedJSON(obj) {
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
        return JSON.stringify(obj);
    }
    const parts = Object.keys(obj)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + sortedJSON(obj[k]));
    return "{" + parts.join(",") + "}";
}

/**
 * AES-256-GCM 加密
 * 輸出格式：nonce(12 bytes) + ciphertext+tag(N+16 bytes)，整包 base64 urlsafe 編碼
 * 與 Python cryptography.AESGCM 的 wire format 完全相同，韌體端無需修改解密範本
 */
async function encryptPayload(payload, secretKeyHex) {
    const key = await crypto.subtle.importKey(
        "raw",
        hexToBytes(secretKeyHex),
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );

    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(sortedJSON(payload));

    // Web Crypto 回傳的 ciphertext 已包含 16 bytes auth tag 在尾端
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        plaintext
    );

    const combined = new Uint8Array(12 + ciphertext.byteLength);
    combined.set(nonce, 0);
    combined.set(new Uint8Array(ciphertext), 12);
    return toBase64Url(combined);
}

// ── /api/shop ──────────────────────────────────────────────────────────────────

// 驗證店家掃碼 token，回傳對應的 shop_id；token 存在 env secrets 不寫死在程式碼
async function handleShop(request, env) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
        return jsonResponse({ error: "missing_token" }, 400);
    }

    const shopMap = {
        [env.SHOP_TOKEN_1]: "shop_1",
        [env.SHOP_TOKEN_2]: "shop_2",
        [env.SHOP_TOKEN_3]: "shop_3",
        [env.SHOP_TOKEN_4]: "shop_4",
        [env.SHOP_TOKEN_5]: "shop_5",
    };

    const shopId = shopMap[token];
    if (!shopId) {
        return jsonResponse({ error: "invalid_token" }, 404);
    }
    return jsonResponse({ shop_id: shopId });
}

// ── /api/stamp ─────────────────────────────────────────────────────────────────

// 寫入集點；同一家店重複蓋只更新時間戳，不重複計數（idempotent）
async function handleStamp(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "請求格式錯誤" }, 400);
    }

    const cardId = String(body.card_id ?? "");
    const shopId = String(body.shop_id ?? "");

    if (!CARD_ID_RE.test(cardId)) {
        return jsonResponse({ error: "無效的集點卡 ID" }, 400);
    }
    if (!VALID_SHOPS.has(shopId)) {
        return jsonResponse({ error: "無效的店家 ID" }, 400);
    }

    const now = nowISO();
    const kvKey = "card:" + cardId;

    let card;
    try {
        const raw = await env.STAMP_CARDS.get(kvKey);
        card = raw === null
            ? { stamps: {}, created_at: now, last_updated: null }
            : JSON.parse(raw);
    } catch {
        return jsonResponse({ error: "讀取集點資料失敗，請稍後再試" }, 500);
    }

    card.stamps[shopId] = now;
    card.last_updated = now;

    try {
        await env.STAMP_CARDS.put(kvKey, JSON.stringify(card));
    } catch {
        return jsonResponse({ error: "儲存集點資料失敗，請稍後再試" }, 500);
    }

    return jsonResponse({
        success: true,
        stamped_count: Object.keys(card.stamps).length,
    });
}

// ── /api/sign ──────────────────────────────────────────────────────────────────

/**
 * 產生兌換 QR Code payload
 * 從 KV 讀 stamps（不信任客戶端），算出 target_total 後加密回傳
 * target_total = floor(stamps數 / 3)，韌體端用 (target_total - already_dispensed) 計算出球數
 */
async function handleSign(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "請求格式錯誤" }, 400);
    }

    const cardId = String(body.card_id ?? "");
    if (!CARD_ID_RE.test(cardId)) {
        return jsonResponse({ error: "無效的集點卡 ID" }, 400);
    }

    let card;
    try {
        const raw = await env.STAMP_CARDS.get("card:" + cardId);
        if (raw === null) return jsonResponse({ error: "card_not_found" }, 404);
        card = JSON.parse(raw);
    } catch {
        return jsonResponse({ error: "讀取集點資料失敗，請稍後再試" }, 500);
    }

    const stamps = card.stamps ?? {};
    const targetTotal = Math.floor(Object.keys(stamps).length / 3);

    if (targetTotal === 0) {
        return jsonResponse({ error: "insufficient_stamps" }, 400);
    }

    const payload = {
        stamps,
        card_id: cardId,
        target_total: targetTotal,
        issued_at: nowISO(),
    };

    const qrPayload = await encryptPayload(payload, env.SECRET_KEY);
    return jsonResponse({ qr_payload: qrPayload });
}

// ── /api/get_card ──────────────────────────────────────────────────────────────

// 跨瀏覽器還原集點卡；使用者換瀏覽器時輸入 8 字元 card_id 取回進度
async function handleGetCard(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "請求格式錯誤" }, 400);
    }

    const cardId = String(body.card_id ?? "");
    if (!CARD_ID_RE.test(cardId)) {
        return jsonResponse({ error: "無效的集點卡 ID" }, 400);
    }

    let card;
    try {
        const raw = await env.STAMP_CARDS.get("card:" + cardId);
        if (raw === null) return jsonResponse({ error: "card_not_found" }, 404);
        card = JSON.parse(raw);
    } catch {
        return jsonResponse({ error: "讀取集點資料失敗，請稍後再試" }, 500);
    }

    const stamps = card.stamps ?? {};
    return jsonResponse({
        card_id: cardId,
        stamps,
        created_at: card.created_at ?? "",
        stamped_count: Object.keys(stamps).length,
    });
}

// ── 主 fetch handler ───────────────────────────────────────────────────────────

export default {
    async fetch(request, env) {
        // OPTIONS preflight 必須在路由分發前攔截，否則瀏覽器預檢會失敗
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders() });
        }

        const { pathname } = new URL(request.url);
        const method = request.method;

        if (pathname === "/api/shop"     && method === "GET")  return handleShop(request, env);
        if (pathname === "/api/stamp"    && method === "POST") return handleStamp(request, env);
        if (pathname === "/api/sign"     && method === "POST") return handleSign(request, env);
        if (pathname === "/api/get_card" && method === "POST") return handleGetCard(request, env);

        return new Response("Not Found", { status: 404 });
    },
};
