# UI 強化與 NFC 計數 — 開發說明文件

> 此文件對應 `ui-enhance` 分支，說明本次改動內容與日後素材替換方式。

---

## 章節 1：本分支改了什麼

| 功能 | 說明 |
|------|------|
| **首次訪問流程** | 偵測到無 `card_id` cookie 且 URL 有 `?shop=token` 時，跳出選擇畫面（建立新卡 / 輸入舊卡編號），而非直接建立新卡。關閉按鈕會提示「集點未完成」而非直接關閉。在 LINE/Facebook 內建瀏覽器中額外顯示提示。 |
| **集點卡編號複製按鈕** | 卡片編號旁新增複製圖示，點擊後自動複製到剪貼簿，按鈕短暫顯示「已複製 ✓」，2 秒後還原。 |
| **地圖式集點卡** | 將 5 個圓圈替換為地圖樣式，店家以圖釘標記呈現。未集章 = 半透明 teal，已集章 = teal 飽和色，本次集到 = 金黃色並有動畫。 |
| **NFC 計數** | 前端偵測 `?source=nfc_xxx` 參數並 fire-and-forget 打後端；後端新增 `/api/track` 寫 KV log、`/api/admin/stats` 提供統計。 |

---

## 章節 2：如何切到這個分支測試

```bash
git checkout ui-enhance
```

用本機 HTTP server 開啟（直接開 `index.html` 可能有 CORS 限制）：

```bash
# 任選一種
npx serve .
python -m http.server 8080
```

然後開瀏覽器 `http://localhost:8080`。

測試 QR 掃碼流程（無 cookie）：

```
http://localhost:8080/?shop=YOUR_SHOP_TOKEN
```

測試 NFC 計數：

```
http://localhost:8080/?source=nfc_entrance
```

---

## 章節 3：如何替換地圖底圖

**建議尺寸：** 800 × 600 px（對應預設 4:3 比例），PNG 或 JPG 皆可。如果地圖較高，可改為 4:5，見下方。

**步驟：**

1. 將地圖圖片放入 `images/` 資料夾，例如 `images/dongao-map.png`
2. 開啟 `js/app.js`，找到 `MAP_CONFIG`（在 STAMP CARD IIFE 頂部）
3. 修改 `background` 和 `aspect_ratio`：

```javascript
var MAP_CONFIG = {
    background: 'images/dongao-map.png',   // ← 填入路徑
    aspect_ratio: '4 / 5',                 // ← 依地圖形狀調整
};
```

4. `commit` 後 `push`，GitHub Pages 自動更新（不需重新部署 Worker）

---

## 章節 4：如何替換店家 icon

**建議尺寸：** 80 × 80 px，PNG 透明背景（圓形構圖效果最佳）。

**步驟：**

1. 將 icon 放入 `images/icons/` 資料夾，例如 `images/icons/shop1.png`
2. 開啟 `js/app.js`，找到 `SHOP_CONFIG`，填入 `icon` 路徑：

```javascript
var SHOP_CONFIG = {
    shop_1: { name: '一把小雨傘', pos: { x: 50, y: 12 }, icon: 'images/icons/shop1.png' },
    // ...
};
```

**變色邏輯：**

- 目前未集章的 icon 透過 CSS 套用 `filter: grayscale(.7) opacity(.7)` 讓圖示變灰。
- 已集章 / 本次集到的 icon 不套 filter，顯示原始色彩。
- 如果你有兩張 icon（亮版 / 暗版），想完全控制外觀，可以改為：

```javascript
// 在 SHOP_CONFIG 加一個 iconEmpty 欄位
shop_1: { name: '...', pos: {x:50,y:12}, icon: 'images/icons/shop1.png', iconEmpty: 'images/icons/shop1-grey.png' },
```

然後在 `renderMap()` 函式的圖片渲染段落加判斷：

```javascript
img.src = stamped ? cfg.icon : (cfg.iconEmpty || cfg.icon);
// 並把 CSS filter 那行拿掉
```

---

## 章節 5：如何新增 / 刪除店家

**前端：** 在 `SHOP_CONFIG` 新增或刪除一個物件即可。地圖渲染是動態讀取的。

```javascript
// 新增 shop_6
shop_6: { name: '店家 F', pos: { x: 70, y: 30 }, icon: null },
```

**後端（重要！同步修改）：**

- 開啟 `src/index.js`，找到 `VALID_SHOPS`（第 6 行左右）
- 加入新店家 ID：

```javascript
const VALID_SHOPS = new Set(["shop_1", "shop_2", "shop_3", "shop_4", "shop_5", "shop_6"]);
```

- 在 Cloudflare Dashboard → Workers & Pages → `eia-application` → Settings → Variables
- 新增環境變數 `SHOP_TOKEN_6`，填入一個隨機字串作為掃碼 token
- 在 `handleShop()` 的 `shopMap` 加一行：

```javascript
[env.SHOP_TOKEN_6]: "shop_6",
```

- 部署 Worker：`npx wrangler deploy`

**兌換邏輯說明：**

`target_total = floor(集章數 / 3)`。店家數量變動不影響這個公式，但如果你有 6 家店，最多能集 6 章，`target_total` 最高 2（可兌換 2 次），以此類推。如需修改兌換比例，改 `handleSign()` 裡的 `/ 3`。

---

## 章節 6：如何修改店家位置

開啟 `js/app.js`，修改 `SHOP_CONFIG` 裡各店家的 `pos`：

```javascript
shop_1: { name: '店家 A', pos: { x: 50, y: 12 }, icon: null },
//                               ↑ 左右 0~100    ↑ 上下 0~100
```

- `x: 0` = 最左，`x: 100` = 最右
- `y: 0` = 最上，`y: 100` = 最下
- 圖釘的錨點在圖釘底部中央（`transform: translate(-50%, -100%)`），所以 `y: 12` 代表圖釘尖端距離地圖頂部 12%

建議先在紙上標好地圖上各店家的大概位置，再換算成百分比填入。

---

## 章節 7：NFC 怎麼用

### NFC 貼片 URL 格式

合作店家 NFC 貼片寫入的 URL 範例：

```
https://wavehank0496.github.io/EIA_application/?source=nfc_entrance
https://wavehank0496.github.io/EIA_application/?source=nfc_shop1_door
```

`source` 只接受小寫英文、數字、底線，且必須以 `nfc_` 開頭。

如果同一個 NFC 貼片同時要觸發集點，可以合併參數：

```
https://wavehank0496.github.io/EIA_application/?shop=TOKEN&source=nfc_shop1
```

### 查看統計

```
https://eia-application.jimhankliang.workers.dev/api/admin/stats?token=你的ADMIN_TOKEN
```

回傳範例：

```json
{
  "by_source": {
    "nfc_entrance": { "total": 234, "today": 12, "last_7_days": 78, "last_seen": "2026-05-14T10:30:00Z" }
  },
  "total_records": 234
}
```

### 設定 ADMIN_TOKEN（必須做）

1. 在終端機執行：

```bash
npx wrangler secret put ADMIN_TOKEN
```

2. 輸入一個長隨機字串（例如 `openssl rand -hex 32` 產生的），按 Enter 儲存。

3. 記下這個 token，只有你知道。

NFC log 資料保留 **90 天**後自動刪除（`expirationTtl: 90 * 86400`）。

---

## 章節 8：如何合併回 main

確認測試無誤後，有兩種方式合併：

### 方式 A：本機合併

```bash
git checkout main
git merge ui-enhance
git push origin main
```

合併後重新部署 Worker（後端有改動）：

```bash
npx wrangler deploy
```

### 方式 B：GitHub Pull Request

```bash
git push origin ui-enhance
```

然後在 GitHub 上開 PR，從 `ui-enhance` → `main`，review 後合併。

合併後在 Cloudflare Dashboard 手動觸發部署，或執行 `npx wrangler deploy`。

---

## 環境變數清單（Cloudflare Dashboard 需要設定的）

| 變數名稱 | 說明 | 設定方式 |
|----------|------|----------|
| `ADMIN_TOKEN` | 查看 NFC 統計的認證 token | `npx wrangler secret put ADMIN_TOKEN` |
| `SHOP_TOKEN_1` ~ `SHOP_TOKEN_5` | 各店家 QR Code token（原本就有） | 已設定，不需改 |

> 如果新增店家，需額外設定 `SHOP_TOKEN_6` 等。
