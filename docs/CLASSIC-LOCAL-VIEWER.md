# Classic 唯讀檢視（測試版）

正式站測試入口為 `https://aetherodie-cmyk.github.io/juice/view.html`；加入 `?file=DRIVE_FILE_ID` 可測試讀取已綁定的 Drive 白板。這仍是測試版，跨帳號分享尚未驗收，不應當作已可用的正式分享功能。`127.0.0.1` 連結只在這台 Mac 可用，不能傳給同事。

1. 在專案根目錄執行 `python3 -m http.server 4214 --bind 127.0.0.1`。
2. 開啟 `http://127.0.0.1:4214/view.html`，按「載入本機 JSON」，先可選 `tests/fixtures/local-viewer-demo.json` 練習，再選擇由 Classic 匯出的完整白板 JSON。
3. 拖曳空白或卡片位置平移；滾輪、＋／− 縮放；「符合視窗」查看全圖。圖片可放大，流程圖可進入既有唯讀檢視器。

不帶 `?file=` 時，白板內容只保留在此分頁記憶體，重新整理即清除；不呼叫 Drive。帶 `?file=DRIVE_FILE_ID` 時顯示 Google 登入，讀取該檔最新同步版本，前景每 30 秒檢查，亦可手動檢查。頁面不載入 Classic 編輯器，沒有保存或匯出操作，不呼叫 IndexedDB、localStorage 或 Drive 寫入 API。它沿用 `JuiceCore` 的格式驗證／安全文字處理、Classic 卡片樣式、Pele 流程圖安全渲染及既有流程圖唯讀檢視器。Pele CDN 無法連線時顯示錯誤訊息，不影響其他卡片。

作者在已綁定 Drive 的 Classic 白板開啟 Drive 面板，可複製 `view.html?file=FILE_ID`。本機白板不顯示此按鈕。連結只指向 Drive 已同步版本；本機草稿不會出現在觀看者頁面。作者仍須在 Drive 將同事設為檢視者，且一般存取保持「受限制」。

目前**跨帳號指定檔案授權仍未完成**：`drive.file` 需要觀看者透過 Google Picker 選取授權檔案，而 `assets/drive-viewer-config.js` 的 Picker API key 仍為空。Cloud 管理員需啟用 Picker API，建立限制來源與 API 的瀏覽器 key，並確認正式頁的 OAuth origin、Audience 與公司 IT 政策。A／B／C 真實帳號測試尚未進行。不得將 mock 測試當成真正的分享驗收。不要把本機 JSON 上傳到未授權服務，或把唯讀 UI 當成存取控制；實際讀取由 Google Drive 權限決定。
