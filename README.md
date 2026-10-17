# 聚思白板（Juice）

純前端個人白板。卡片、區塊編輯、連線、標籤、參考圖片、地圖擷取與 AI JSON 收件匣；不包含 AI 模型服務或後端資料庫。

## 開發與驗證

直接以靜態伺服器開啟，不需要建置：

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

瀏覽 `http://127.0.0.1:8080`。瀏覽器儲存依 origin 區分，換 hostname、port 或瀏覽器都不會自動帶入資料；請先匯出 JSON。`file://` 的本機儲存行為依瀏覽器而異，Google 登入應使用設定好的 HTTP localhost 或 HTTPS 網址。

測試使用 Node.js 22+、Python 3 及 Chromium：

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

測試以模擬的 Google 授權與 Drive HTTP 回應驗證，不存取真實帳號。GitHub Checks 只執行驗證，不執行部署。

## 檔案結構

- `index.html`：唯一應用畫面。
- `whiteboard.html`：舊網址轉址至同目錄 `index.html`，避免兩份程式分歧。
- `assets/styles.css`：畫面樣式。
- `assets/core.js`：HTML 允許清單、資料格式／容量驗證、IndexedDB、寫入序列與 HTTP 錯誤／逾時處理。
- `assets/app.js`：白板編輯、儲存協調、Drive、本機檔案、收件匣、地圖及畫面事件；以功能段落組織，共用同一份狀態。
- `tests/whiteboard.spec.cjs`：瀏覽器回歸測試。
- `docs/maintenance.md`：資料格式、同步限制、OAuth、復原與發布流程。

## 框選與批次移動

- 點工具列「框選」，在空白處拖出選取框；與框相交的卡片會被選取。
- 拖曳任一已選卡片，整批卡片保持相對位置一起移動。
- 不切換模式也可按住 Shift 拖曳空白處框選，並加入原有選取。
- 點空白處取消選取；Esc 取消進行中的框選，再按 Esc 可退出框選模式。
- 關閉「框選」後，空白處拖曳維持畫布平移；縮放與雙指操作維持原本行為。

## 資料與同步

本機主資料使用 `localStorage` 的 `sju-whiteboard-v2`，可讀取舊 `sju-whiteboard-v1`。輸出 schemaVersion 3，保留舊鍵名方便搬移既有資料。圖片內嵌於 JSON；單次匯入上限 20 MB，實際瀏覽器儲存容量可能更小。

本機容量不足時仍嘗試 Drive／檔案同步。Drive 與本機同步檔採單一目的地，切換前先保存、保留 IndexedDB 快照。JSON 匯入建立本機白板，不覆蓋原 Drive 檔。

每次寫回先讀取遠端並比較載入基準；不同則停止覆寫並保存兩份內容。單一瀏覽器的寫入依序執行，避免先後顛倒。這不是多人即時協作系統，仍應避免同時編輯。

「復原備份」可下載最近 20 筆 IndexedDB 快照。重要內容仍需定期使用「匯出」下載獨立 JSON。登出不會清除本機資料；共用電腦請在備份後清除網站資料。

## 部署

既有 GitHub Pages 從 `main` 根目錄發布；推送到 main 可能更新正式站。沒有編譯步驟，須一起發布 HTML 與 `assets/`。本次維護不變更 Pages 設定。發布前請依維護文件完成人工授權測試及備份。
