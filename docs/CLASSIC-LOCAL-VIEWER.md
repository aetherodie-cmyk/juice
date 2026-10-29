# Classic 唯讀檢視（測試版）

正式站測試入口為 `https://aetherodie-cmyk.github.io/juice/view.html`；加入 `?file=DRIVE_FILE_ID` 可讀取已綁定的 Drive 白板。這仍是測試版，需逐檔確認 Drive 檢視權限與指定檔案授權。`127.0.0.1` 連結只在這台 Mac 可用，不能傳給同事。

1. 在專案根目錄執行 `python3 -m http.server 4214 --bind 127.0.0.1`。
2. 開啟 `http://127.0.0.1:4214/view.html`，按「載入本機 JSON」，先可選 `tests/fixtures/local-viewer-demo.json` 練習，再選擇由 Classic 匯出的完整白板 JSON。
3. 拖曳空白或卡片位置平移；滾輪、＋／− 縮放；「符合視窗」查看全圖。圖片可放大，流程圖可進入既有唯讀檢視器。

不帶 `?file=` 時，白板內容只保留在此分頁記憶體，重新整理即清除；不呼叫 Drive。帶 `?file=DRIVE_FILE_ID` 時顯示 Google 登入，讀取該檔最新同步版本，前景每 30 秒檢查，亦可手動檢查。頁面不載入 Classic 編輯器，沒有保存或匯出操作，不呼叫 IndexedDB、localStorage 或 Drive 寫入 API。它沿用 `JuiceCore` 的格式驗證／安全文字處理、Classic 卡片樣式、Pele 流程圖安全渲染及既有流程圖唯讀檢視器。Pele CDN 無法連線時顯示錯誤訊息，不影響其他卡片。

作者在已綁定 Drive 的 Classic 白板開啟 Drive 面板，可複製 `view.html?file=FILE_ID`。本機白板不顯示此按鈕。連結只指向 Drive 已同步版本；本機草稿不會出現在觀看者頁面。作者仍須在 Drive 將同事設為檢視者，且一般存取保持「受限制」。

若 Google 已登入且帳號能在 Drive 開啟檔案，但 Juice 顯示「無法讀取指定檔案」，按「授權指定檔案」，在 Google Picker 確認此連結指向的同一份檔案；不需授權整個 Drive。Picker API 已在同一 Google Cloud 專案啟用，瀏覽器 API key 限制為 Juice 正式來源與 `docs.google.com`，僅允許 Google Picker API、Google Drive API。測試檔的 B 可讀、C 不可讀及同步更新由使用者實測；另一份既有白板的 Picker 授權仍需實機驗證。不要把 mock 測試當成真正的分享驗收。不要把本機 JSON 上傳到未授權服務，或把唯讀 UI 當成存取控制；實際讀取由 Google Drive 權限決定。
