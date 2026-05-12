# 建立 Cloudflare KV Namespace 並取得認證資訊

## 步驟一：建立 KV Namespace

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左側選單點選 **Workers & Pages** → **KV**
3. 點選 **Create a namespace**
4. 輸入名稱（例如 `eia-stamp-cards`），按 **Add**
5. 建立後，記下畫面上顯示的 **Namespace ID**（格式為 32 字元 hex）

## 步驟二：取得 Account ID

1. 在 Dashboard 右側側欄（或 Workers & Pages 首頁）可以看到 **Account ID**
2. 也可以從任意 Worker 的設定頁找到

## 步驟三：建立 API Token（有 KV 讀寫權限）

1. 右上角頭像 → **My Profile** → **API Tokens**
2. 點選 **Create Token**
3. 選擇 **Edit Cloudflare Workers** 範本，或選 **Create Custom Token**：
   - **Permissions**: `Account` → `Workers KV Storage` → `Edit`
   - **Account Resources**: 選擇你的帳號
4. 按 **Continue to summary** → **Create Token**
5. **立即複製 Token**（只顯示一次）

## 步驟四：設定 Render 環境變數

在 Render 控制台的服務設定 → **Environment** 頁，新增以下變數：

| Key | Value |
|-----|-------|
| `CF_ACCOUNT_ID` | 步驟二取得的 Account ID |
| `CF_NAMESPACE_ID` | 步驟一取得的 Namespace ID |
| `CF_API_TOKEN` | 步驟三取得的 API Token |

> **注意**：Token 絕對不可以 commit 進 Git。使用 Render 的 Environment 頁面管理所有 Secret。
