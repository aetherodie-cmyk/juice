# 維護與復原

## 資料格式

白板根物件：`schemaVersion: 3`、`boardId`、`cards`、`links`、`groups`、`images`、`view`、`savedAt`。

- 舊白板沒有 schemaVersion／boardId 仍可載入；舊 `body` HTML／`text` 會遷移為區塊。
- 卡片：`id, x, y, title, blocks, tags, color, shape, collapsed, createdAt, updatedAt`。
- 區塊：`id, type, html, checked, src`。HTML 僅保留允許的文字格式與 HTTP(S)／mailto 連結；移除事件、嵌入與未知屬性。
- 核准的 AI 卡片另保存 `sourceInbox`，以來源檔與卡片 ID 避免失敗重試重複新增。
- 連線：`id, from, to, dir, label`，端點必須存在。
- 圖片：HTTPS 或 PNG/JPEG/WebP/GIF 的 base64 Data URL；不接受 SVG 或任意 HTML URL。
- 匯入上限 20 MB；卡片最多 10,000、每張區塊最多 5,000、連線最多 30,000；不合法、重複 ID、超範圍尺寸、未知資料版本會拒絕載入。
- 收件匣：`{"version":1,"inbox":[...]}`，每張卡片必須有穩定且唯一的英數／底線／連字號 ID。外部工具須先讀現有內容，再新增項目；不能用舊快照覆蓋整份檔案。

## 儲存與復原

`localStorage` 保存目前白板；IndexedDB `sju-sync` version 2 包含 `kv`（handle）與 `recovery`（最近 20 筆快照）。切換／刪除前快照、同步前候選資料及審核前備份共用此 20 筆上限。清除瀏覽器網站資料會同時刪除本機白板與快照；它們不是異地備份。

1. 正常備份：按「匯出」，下載可直接匯入的白板 JSON。
2. 操作失敗或衝突：先匯出目前白板，再按「復原備份」，依時間選擇白板／本機／遠端版本下載，使用「匯入」開啟。選單也可下載完整快照封存（含收件匣）。
3. 封存檔格式是 `{version:1,snapshots:[{at,reason,value}]}`。找到需要的紀錄，取出 `value`（白板快照）、`value.local`（寫入前本機）、`value.remote`（寫入前遠端）、或 `value.board`（審核前白板），另存為 JSON 後匯入。這些子物件須含 `cards` 才是白板；`value.inbox` 是收件匣，不能直接匯入白板。
4. 本機資料損壞：按「原始備份」下載 localStorage 原文；先在副本修復，再關閉白板、於瀏覽器開發工具移除損壞的 `sju-whiteboard-v2`（以及仍損壞的 v1），重新開啟後匯入修復檔。程式會停止覆寫損壞的原始資料。
5. Drive 衝突：按「匯出」或下載快照後，在 Drive 清單再次選取目前白板；明確確認放棄待同步編輯，重新載入遠端。要保留本機版本，可先匯出，處理衝突後另建白板再搬入內容。
6. 本機同步檔衝突：匯出／下載快照後解除連結，使用「連結現有同步檔」重新載入；解除連結會保留目前白板快照。
7. 被刪除的 Drive 白板及收件匣移至 Drive 垃圾桶，可在 Google Drive 手動還原。

快照寫入失敗時，程式會停止可能覆蓋資料的操作。請先下載備份，再釋放網站儲存空間。

## 開始畫面與本機白板清單

`localStorage` 的 `sju-workspace-meta` 保存目前名稱／來源與 boardId，不包含 token。只有 meta.boardId 與目前白板一致才採用；上次的 Drive／檔案來源在重新整理後只恢復為 cache 標示，不自動重建同步綁定。

IndexedDB `sju-sync` 的既有 `kv` store 新增：

- `local-board:<boardId>`：具名本機白板的完整 state 與 meta。
- `local-board-index`：名稱、boardId 與保存時間清單。

`Core.storeLocalBoard` 以同一 readwrite transaction 保存白板與索引，背景寫入另經序列佇列。切換前等待保存完成；本機白板不受 recovery 的 20 筆上限影響。它們仍屬同一瀏覽器本機資料，並非異地備份。開始畫面的「匯出目前白板」與編輯工具列匯出均產生標準白板 JSON。

首頁與 Drive API 測試使用 mock 驗證登入後列表、建立／開啟、重新整理後離線副本標示、具名本機白板切換、匯入與未同步內容保護；真實 OAuth 授權仍須以測試帳號人工驗證。

## 手機介面與手勢

手機判斷為 `(max-width:640px), (pointer:coarse) and (max-width:1024px)`，JavaScript 與 CSS 使用同一條件。既有新增／框選按鈕移到手機底部導覽，不複製 DOM ID；離開手機版時透過 placeholder 移回桌面工具列。其餘工具以可捲動選單呈現，保留原本事件與原生檔案挑選流程。

卡片瀏覽共用畫布的 pointer map，單指位移超過 8 px 才平移；兩指會取消單指點擊意圖並進入縮放，避免縮放後誤開卡片。手機移動模式才呼叫卡片拖曳；pointercancel 會還原該次移動，不保存半途座標。多選集合沿用桌面資料模型，批次移動仍記為一步復原。

編輯頁由 Visual Viewport 的 height／offsetTop 調整；小於 440 px 時以「外觀」按鈕暫時收合顏色與形狀，優先保留輸入空間。安全區域採 CSS env，輸入欄位採適合手機的字級；不禁止頁面縮放。保存狀態與既有本機／Drive 錯誤共用來源，不新增同步通道。

回歸測試以 Chromium 觸控 context 與 CDP 多點事件驗證手勢；縮小 viewport 測試不等同真實系統鍵盤。發布前建議另測 iOS Safari 與 Android Chrome 的實際鍵盤、橫向、瀏覽器列收合與 App 切回，並沿用既有真實 OAuth 測試流程。

## 操作復原紀錄

`assets/app.js` 的工作階段歷史以 `cards/links/groups/images` 作為內容快照；不納入 viewport、savedAt、帳號或同步目的地。所有一般保存操作透過 `scheduleSave` 比對內容並記錄，拖曳只在結束時記錄整批操作，文字 input 使用欄位 key 合併一秒內的連續輸入。復原會重建畫面、保存本機並排程同步，因此復原結果仍會寫回目前的 Drive／本機檔案，但不繞過原有遠端衝突檢查。

最多 50 步，前後快照字串估計總量最多 16 MB；超過限制會移除最舊紀錄，單筆超過上限則無法提供該步復原。歷史不寫入 JSON 或 localStorage。切換白板／來源與收件匣審核後清空歷史，避免復原到其他白板或假裝回復外部交易。持久復原仍使用 IndexedDB 快照或獨立 JSON 備份。

## 同步限制

- 編輯後 350 ms 保存本機，再分別延遲 1.2 秒／800 ms 寫入 Drive／檔案。
- Drive 401 要求使用者重新授權；不操作 Google SDK 私有 callback、不在背景假設能靜默取得 token。Token 僅存在記憶體，登出不代表撤銷 Google 的既有授權；撤銷請至 Google 帳號權限管理。
- Drive 請求停用瀏覽器快取，避免以舊內容判斷同步基準。GET／PATCH 的 429、5xx 最多嘗試三次，每次請求最多 15 秒。POST 不自動重試，以免重複建立。中斷與逾時不會被視為成功。
- Drive 寫入採遠端內容基準比對；伺服器回傳 ETag 時附帶 If-Match，412 視為衝突。未回傳 ETag 時，讀取與寫入之間仍有競態，因此每次寫入前都保存本機／遠端快照。不能承諾跨裝置原子更新。
- 本機 File System Access API 沒有跨裝置比較後原子替換機制，也依賴桌面同步服務；讀後寫之間仍有競態。請單一裝置編輯，切換前先保存並等待同步服務完成。
- 收件匣先保存目的白板，再移除待審項目；移除前重新讀取並保留新到項目。仍無法跨白板／收件匣執行伺服器交易，外部寫入工具必須配合序列寫入。
- 重新整理後保留本機內容；不自動重載上次同步檔或把本機快取寫回 Drive。使用者重新選擇目的地前會先保留快照。
- 多分頁共用 localStorage，目前僅提示其他分頁更新，不自動合併。避免多分頁編輯；後續若需要多人使用，應導入伺服器版本鎖或協作資料模型。
- 關頁前嘗試保存本機，未同步時提供瀏覽器離開提醒；瀏覽器／系統強制關閉仍無法保證完成雲端請求。

## Google OAuth 與 Drive

目前 client ID 在 `assets/app.js`；公開的 Web OAuth client ID 不是 client secret。請勿將 client secret、access token 或使用者資料提交 Git。

Google Cloud Console 必須人工確認：

- 已啟用 Drive API，OAuth 用戶端類型為 Web application。
- Authorized JavaScript origins 包含 `https://aetherodie-cmyk.github.io`；本機測試另設實際 origin（例如 `http://localhost:8080`，與 `127.0.0.1` 不同）。origin 不含 `/juice` 路徑。
- 同意畫面的名稱、支援信箱、測試／正式發布狀態與測試帳號符合使用對象。
- scope 僅 `https://www.googleapis.com/auth/drive.file`；程式不要求姓名、email、頭像，也不呼叫 userinfo。
- `drive.file` 只涵蓋應用程式可存取的檔案；手動放進資料夾的檔案未必可列出。外部工具生成 inbox 必須在其可存取的既有檔案寫入。

資料夾為「聚思白板」。新 inbox 用 appProperties `juiceType: inbox` 與 `juiceBoardId: <Drive file ID>` 配對；舊 inbox 以名稱回退。重複資料夾／收件匣會拒絕任意選第一份。避免重名白板；手動重新命名舊版白板時也需同步重新命名其 inbox。

## 發布與回復

1. 先匯出正式使用中的白板／收件匣。
2. 在分支上修改；執行 `npm ci`、`npm run check`、`npm test`。
3. 以測試 OAuth origin 與測試 Drive 資料夾人工驗證登入、到期、建立、讀寫、垃圾桶、衝突、容量不足和收件匣重試。自動測試使用 mock，無法替代 Google Console、真實 ETag／CORS 與帳號權限驗證。
4. 檢查 diff 與相容性後，再經使用者授權推送／合併到 main。既有 Pages 的 main 根目錄發布可能自動更新正式站；此流程不自動部署。
5. 若需回復，還原程式版本並重新發布；資料另由 JSON／快照復原。程式回復不會還原 Drive 內容。

地圖使用 OpenStreetMap 圖磚與 Nominatim。擷取圖片已帶入署名；正式擴大使用前須檢查服務使用政策、搜尋頻率與快取策略。

參考：
- [Google Token Model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Drive files.update](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update)
- [GitHub Pages 發布來源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
