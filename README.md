# EIA Application — 集點扭蛋系統

鄉村旅遊集點扭蛋系統。後端部署在 Cloudflare Python Workers，前端部署在 GitHub Pages。

---

## 1. 建立 Cloudflare KV Namespace

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → 左側選單 **Workers & Pages → KV**
2. 點選 **Create a namespace**，輸入名稱（例如 `eia_stamp_cards`），按 **Add**
3. 記下顯示的 **Namespace ID**（32 字元 hex）

---

## 2. 設定 wrangler.toml

把 `wrangler.toml` 裡的 KV namespace `id` 換成上一步取得的值：

```toml
[[kv_namespaces]]
binding = "STAMP_CARDS"
id = "貼上你的 Namespace ID"
```

---

## 3. 設定 Secrets

以下 6 個環境變數**不能**寫進 `wrangler.toml` 或 commit 進 Git。

### 方法 A：用 wrangler CLI（本機操作）

```bash
# 先產生 AES-256-GCM 金鑰（64 字元 hex = 32 bytes）
python -c "import secrets; print(secrets.token_hex(32))"
wrangler secret put SECRET_KEY   # 貼上上方輸出值

# 每家店各一個隨機 token
python -c "import secrets; print(secrets.token_hex(16))"
wrangler secret put SHOP_TOKEN_1
wrangler secret put SHOP_TOKEN_2
wrangler secret put SHOP_TOKEN_3
wrangler secret put SHOP_TOKEN_4
wrangler secret put SHOP_TOKEN_5
```

### 方法 B：Cloudflare Dashboard（不需本機安裝 wrangler）

**Workers & Pages → eia-application → Settings → Environment Variables → Add variable → Encrypt**

逐一新增：`SECRET_KEY`、`SHOP_TOKEN_1` ~ `SHOP_TOKEN_5`，型別選 **Secret**。

---

## 4. 透過 Cloudflare Dashboard 連 GitHub 自動部署

1. **Workers & Pages → Create → Pages → Connect to Git**
2. 選擇你的 GitHub repo
3. **Build settings**：
   - Build command：`npx -y -p workers-py pywrangler deploy`
   - Build output directory：`/`（留空或填 `/`）
4. 儲存後，每次 push 到 `main` 會自動觸發部署

---

## 5. 本機開發測試

```bash
# 安裝 Python 開發工具（需 Python 3.11+）
pip install "workers-py"

# 本機啟動（會連到 Cloudflare KV，需先 wrangler login）
uvx --from workers-py pywrangler dev

# 部署
uvx --from workers-py pywrangler deploy
```

本機測試時 KV 使用 `preview_id`（若有設定），否則直接讀寫正式 namespace。

---

## 6. 部署後更新前端 API_BASE

部署成功後，在 Cloudflare 確認 Worker URL（格式為 `https://eia-application.YOUR_ACCOUNT.workers.dev`），
然後確認 `js/app.js` 頂部的 `API_BASE` 設定正確：

```javascript
var API_BASE = 'https://eia-application.jimhankliang.workers.dev';
```

---

## 7. 專案結構

```
├── app.py               # Python Workers 主程式
├── js/
│   └── app.js           # 前端邏輯（GitHub Pages）
├── css/
│   └── style.css
├── index.html
├── pyproject.toml       # Python 依賴（cryptography）
├── wrangler.toml        # Cloudflare 設定（namespace ID，無 secrets）
├── .gitignore
└── README.md
```

---

## 注意事項

- `SECRET_KEY` 和 `SHOP_TOKEN_*` **絕對不能** commit 進 Git
- `app.py` 的 CORS 只開放 `https://wavehank0496.github.io`；本機用 curl 測試時需帶 `-H "Origin: https://wavehank0496.github.io"`
- 若 `cryptography` 在 Pyodide 上有問題，請回報，改用 Plan B（pycryptodome 或 Web Crypto API FFI）
