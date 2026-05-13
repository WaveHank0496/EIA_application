# EIA Application — 集點扭蛋系統

鄉村旅遊集點扭蛋系統。後端部署在 Cloudflare Workers（JavaScript），前端部署在 GitHub Pages。

---

## 1. 設定 Secrets

以下 6 個環境變數**不能**寫進 `wrangler.toml` 或 commit 進 Git。

**方法 A：wrangler CLI**

```bash
# 產生 AES-256-GCM 金鑰（64 字元 hex = 32 bytes）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put SECRET_KEY

# 各店家 token（各自產生隨機值）
npx wrangler secret put SHOP_TOKEN_1
npx wrangler secret put SHOP_TOKEN_2
npx wrangler secret put SHOP_TOKEN_3
npx wrangler secret put SHOP_TOKEN_4
npx wrangler secret put SHOP_TOKEN_5
```

**方法 B：Cloudflare Dashboard**

Workers & Pages → eia-application → Settings → Environment Variables → Add variable（選 Encrypt）

---

## 2. 部署

```bash
npm install
npm run deploy
```

每次 push 到 `main` 後手動執行 `npm run deploy`，或在 Cloudflare Pages 設定 CI 自動部署。

---

## 3. 本機開發

```bash
npm run dev
```

本機測試時在 `wrangler.toml` 暫時加 `[vars]` 區塊提供測試值（勿 commit）。

---

## 4. 專案結構

```
├── src/
│   └── index.js         # Workers 主程式（4 個 API endpoint）
├── js/
│   └── app.js           # 前端邏輯（GitHub Pages）
├── css/
│   └── style.css
├── index.html
├── wrangler.toml        # Cloudflare 設定（KV namespace ID，無 secrets）
├── package.json
└── README.md
```

---

## 注意事項

- `SECRET_KEY` 和 `SHOP_TOKEN_*` **絕對不能** commit 進 Git
- CORS 只開放 `https://wavehank0496.github.io`；用 curl 測試時需加 `-H "Origin: https://wavehank0496.github.io"`
- 加密使用 Web Crypto API（Workers runtime 內建），不需任何外部套件
