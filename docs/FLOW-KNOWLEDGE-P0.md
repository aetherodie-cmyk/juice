# 流程知識白板 P0：Workspace 本機驗收版

本文件對應「Juice 第一階段｜流程知識白板規格 V1.0」。本機 Workspace 已具備獨立流程主檔、三張以上白板固定版本引用、全畫面閱讀／明確編輯、手動更新及既有流程安全導入。自動測試使用模擬的三張白板；**使用者實際的「OMG 系統總覽／線上訂單／系統介接」資料尚未提供，真實內容驗收仍待使用者操作**。Classic 應用維持原樣，不直接接入此本機流程庫；P1 閱讀視角、精細差異與進階布局尚未實作。

## 資料邊界

- `assets/flow-library-core.js` 定義 `juice-flow-library` version 1；本機 UI 透過 `assets/flow-library-store.js` 保存到獨立 IndexedDB `juice-flow-library-db-v1`，與 Classic 的 IndexedDB／Drive、Workspace 的 `juice-nested-prototype-v1` 完全分離。核心保留 `juice-flow-library-v1` localStorage 介面，僅供單元測試與資料契約驗證，UI 不使用此鍵。
- `flows[]` 是獨立流程主檔。每個主檔有穩定 ID、名稱和依序追加的 `versions[]`；版本保存原始 Mermaid `source`、可選的 Flow Plus／AI `aiContext`、更新摘要及建立時間。節點 ID 沿用原文，不重新產生。
- `references[]` 是白板上的引用元件，指向 `flowId` 與固定 `version`。`boardId` 需加 `classic:` 或 `workspace:` 前綴。顯示位置、尺寸與密度只存在引用上；閱讀時的縮放、展開、選取不寫入正式流程庫。
- `publish` 只追加新版，不改既有引用；`updateReference` 需提供目前版本作為確認條件，才更新單一引用。`resolve` 回傳該引用的固定內容及有無新版。
- `removeReference` 只刪白板引用；本切片**不提供刪除流程主檔**，避免在引用保護 UI 完成前發生誤刪。

## 保存與相容性

IndexedDB 寫入在單一讀寫交易內重新讀取資料並驗證修訂及不可覆寫的舊版本。無法解析的既有資料會保留原樣，不自動以空白庫覆蓋。每份流程庫最多 20 MB；單版流程原文最多 15,000 字，詳情最多 50,000 字。

「Workspace 白板」可建立多張獨立的本機白板並切換；舊白板仍保留在原有 `juice-nested-prototype-v1`，新增白板使用 `juice-nested-prototype-v1:board:<id>`，目前白板選擇記在 `juice-workspace-active-board-v1`。切換前會先保存目前白板，若保存失敗則不切換。流程引用前也會先保存白板 ID，避免新白板尚未保存造成孤立引用。

從頂部「流程知識庫」可建立主檔、引用到目前白板，或明確導入目前白板的自身流程與來源白板副本中的流程圖。導入保留原流程卡、原文及節點 ID；先建立 v1，再建立引用。若第二步失敗，主檔仍留在流程庫，可重新引用，來源絕不刪除。舊 Classic 白板不會被讀寫。

「下載流程庫 JSON」備份流程主檔與所有白板引用，只允許將備份還原到**空白**流程庫，避免覆蓋已有版本或引用。每張 Workspace 白板需各自下載原型 JSON；**原型 JSON 不包含流程庫，流程庫 JSON 也不包含白板卡片**。不同瀏覽器、主機或裝置的資料不會自動同步。匯入 Workspace 原型若更換白板 ID，不會自動搬移流程引用。

流程引用按 `workspace:<原型 ID>` 對應白板；卡片位置、尺寸與版本指標存在流程庫，不改動原版白板或 Workspace 原型的工作資料。全畫面流程工作空間可讀取所有已存版本；可用 Mermaid 原文、共用圖形編輯器與 Flow Plus 詳情編輯。保存會新增版本，但不自動更新任何引用。切換引用版本時會顯示摘要並要求確認。離開未保存的編輯會提示保存、放棄或繼續編輯。白板上只拖曳／縮放整個流程元件，不直接操作內部節點。

既有 Classic diagram block、Workspace `native.items` 中的自身流程及來源引用均保持原樣。導入本機流程庫是使用者明確啟動的新增操作，不會自動取代舊卡；確認備份與新引用正常後，使用者可自行處理多餘舊卡。原版 Classic 的正式儲存區與 Drive 不讀寫。

## 驗收邊界

1. 請先備份目前 Workspace 原型 JSON；在本機新建「線上訂單」與「系統介接」兩張白板，現有 OMG 白板保留。
2. 導入「線上訂單轉客製單」既有流程，於三張 Workspace 白板分別引用；確認只有一份主檔，各張卡片位置與尺寸可各自變動。
3. 從任一引用進入全畫面，修改節點與條件，保存 v2；確認另外兩張仍顯示 v1。逐張閱讀摘要、手動套用或回指 v1，重新載入後檢查。
4. 分別下載三張白板原型 JSON 及一份流程庫 JSON。本機測試不等於正式 OMG 業務內容驗收，也不聲稱 Classic 的畫布已接入新流程引用。

執行 `node --test tests/flow-library.unit.cjs` 可驗證資料契約；`npx playwright test --config=playwright.nested.config.cjs tests/flow-library.spec.cjs` 驗證三白板引用、版本固定與單張更新、既有流程導入、圖形編輯、移除引用、重新載入、備份與並行交易。
