# EIA Application — 集點扭蛋系統

鄉村旅遊集點扭蛋系統。後端部署在 Cloudflare Python Workers，前端部署在 GitHub Pages。

---

## 1. 建立 Cloudflare KV Namespace

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → 左側選單 **Workers & Pages → KV**
2. 點選 **Create a namespace**，輸入名稱（例如 `eia_stamp_cards`），按 **Add**
3. 記下顯示的 **Namespace ID**（32 字元 hex）

---

## 2. 設定 wrangler.toml

把 `wrangler.toml` 裡的 `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` 換成上一步取得的 Namespace ID：

```toml
[[kv_namespaces]]
binding = "STAMP_CARDS"
id = "31ac37784e984e53a82b6e94509a23e2"   # ← 換成你的 ID
```

---

## 3. 設定 Secrets（用 wrangler secret put）

以下 6 個環境變數**不能**寫進 `wrangler.toml`，改用 `wrangler secret put` 設定：

```bash
# AES-256-GCM 加密金鑰（64 字元 hex = 32 bytes）
python -c "import secrets; print(secrets.token_hex(32))"   # 先產生值
wrangler secret put SECRET_KEY

# 每家店各一個隨機 token（16 字元 hex 即可）
python -c "import secrets; print(secrets.token_hex(16))"
wrangler secret put SHOP_TOKEN_1
wrangler secret put SHOP_TOKEN_2
wrangler secret put SHOP_TOKEN_3
wrangler secret put SHOP_TOKEN_4
wrangler secret put SHOP_TOKEN_5
```

---

## 4. 本機開發（pywrangler dev）

```bash
# 安裝依賴
pip install -e ".[dev]"          # 安裝 workers-py 等 dev 工具

# 本機啟動（需要先登入 wrangler）
wrangler login
pywrangler dev
# 或直接用 wrangler：
wrangler dev
```

本機測試時 KV 會使用 `preview_id`；可在 wrangler.toml 加一行 `preview_id = "..."` 指向測試用的 KV namespace。

---

## 5. 部署（pywrangler deploy）

```bash
pywrangler deploy
# 或：
wrangler deploy
```

部署成功後 Worker URL 為：`https://eia-application.<your-subdomain>.workers.dev`

確認 `js/app.js` 裡的 `API_BASE` 已設定為正確的 Workers URL。

---

## 6. 專案結構

```
├── src/
│   └── worker.py        # Python Workers 主程式
├── js/
│   └── app.js           # 前端邏輯（GitHub Pages）
├── css/
│   └── style.css
├── index.html
├── pyproject.toml       # Python 依賴
├── wrangler.toml        # Cloudflare 設定（無 secrets）
├── .gitignore
└── README.md
```

---

## 注意事項

- `SECRET_KEY` 和 `SHOP_TOKEN_*` **絕對不能** commit 進 Git
- 前端 CORS 只開放 `https://wavehank0496.github.io`，本機測試需改 `wrangler.toml` 的 CORS origin 或用 curl
