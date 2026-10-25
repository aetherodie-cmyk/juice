# Workspace 多視角探索介面 V1 · 本機原型

入口：本機 `workspace.html`，或白板開始畫面的「Workspace 開發預覽」。入口開新分頁，不離開目前白板。此功能在 `codex/workspace-mvp` 分支，尚未合併或部署。

## 先試這條路

1. 用 HTTP 靜態伺服器開啟，例如 `python3 -m http.server 4200 --bind 127.0.0.1`。
2. 開啟 `http://127.0.0.1:4200/workspace.html`，按「載入 Amendment 範例」。
3. 先在 OMG 功能版圖選「Amendment 訂單異動」，進入功能詳細頁。總覽／原尺寸可切換；小螢幕保留可讀尺寸，能左右捲動。
4. 在「工作」點 `T-DECISIONS`，查看來源與相關成果，修改狀態／負責人並儲存。切換「流程」「時程」，核對同一工作的新值；Case 的結果仍為待確認。按「返回 OMG 功能全覽」或頂部常駐入口返回版圖。支援瀏覽器上一頁與 Escape 關閉詳情。
5. 按「下載 Workspace JSON」，確認檔案已保存。重新整理後匯入該檔，核對狀態、來源與關係仍在。

本版只在頁面記憶體編輯，不自動保存或同步。切換視角或返回全覽會保留尚未儲存的表單草稿；需先儲存任務或還原編輯才能下載 JSON。離開與替換有未匯出變更時會確認；瀏覽器的離開提示仍受其使用者互動限制，不能取代下載備份。下載完成由瀏覽器負責，不宣稱已實際寫入指定磁碟位置。

## 探索方式

- **OMG 功能全覽**：自由白板風格，節點代表功能範圍。實線為系統歸屬；虛線由「功能擁有的工作 → 影響流程 → 影響元件」現有關係推導，不是新增的業務執行順序。版圖加入歷史文件提到的 Party、Product、Channel、Order、Subscription、Invoice、Receivable、RMA 等範圍參考，既有 Amendment／Delivery／Fulfillment ID 不變。其餘範圍不假裝已有工作資料；此圖不宣稱完整盤點或目前定案架構，RMA 範圍也不等於獨立後端元件。
- **工作**：只顯示屬於目前功能的工作，按已知狀態分組，不推測百分比進度。點選後在詳情查看決策、Case 與成果。多對多共用目標不會把其他模組的任務誤收進來。
- **流程**：將既有 `process.fields.path` 畫成節點與箭頭，並顯示關聯工作。這是已有簡化路徑，不自行補造判斷、退回或完整執行語意，也不新增另一份任務。
- **時程**：有明確確認日期才畫在日曆時間軸；其他階段／里程碑／工作顯示於「待排期」。來源未提供日期時，不出現示意月份或虛構交付日。確認排期可由獨立 JSON 的 `fields.schedule` 提供 `{startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", confirmed: true}`；這是可選欄位，UI 尚未提供日期編輯器。無效日期、反向區間與未確認日期不放到時間軸。

## 資料契約

獨立格式為 `format: juice-workspace, version: 1`，不接受白板 schemaVersion 3 或 juice-flow。

| 集合 | 用途 |
|---|---|
| objects | 穩定 id、kind、title、fields、revision、sourceRefs、note。任務 fields 保存唯一的 status 與 owner；未知為 null。 |
| relations | 穩定 id、fromId、predicate、toId、certainty、sourceRefs，容許多對多；來源／建議／確認分開。 |
| sources | id、title、locator、version、note。來源位置以純文字顯示，不自動載入、不執行。 |
| assertions | 保留欄位的待確認、衝突或人工編輯註記；不存另一份可編輯狀態。 |
| views | 原有視角 id、kind、title、layout 全部保留，不因新導覽重建。全覽使用 system.layout 中合法的物件座標或展示預設位置；三種詳細視角各自布局，不開放拖拉，匯入的其他布局資料原樣往返。 |
| changes | 任務編輯前後值、時間與物件 id；工作空間與物件 revision 同時遞增。 |

物件種類：system、module、goal、task、process、decision、case、evidence。id 為 1～100 位英數、底線或連字號；物件 id 在工作空間內唯一，不根據標題重算。各集合也驗證重複 id、關係與來源端點。單檔上限 2 MB、物件 1000、關係 5000、來源 200、註記 2000、視角 20、變更 1000 筆。

任務狀態：null 待確認、todo、doing、blocked、done。owner 為 null 或最多 100 字的名稱。本版只修改狀態與負責人；patchTask 不變更其他物件、目標、Case、關係、來源或原始註記。人工編輯註記與來源的未解問題同時保留，不把人工輸入說成歷史來源的結論。

原有五份 view 設定仍保存在資料中，但不再以五個平行頁籤呈現：系統成為入口版圖，工作／流程／時程位於功能詳細頁，成果位於物件詳情。這是 UI 導覽調整，不是資料遷移。任務完成不自動關閉目標、不修改業務流程狀態、不標記測試通過。流程是本檔的關係摘要，不是 Classic／Flow Plus 圖形編輯器。

## 與既有白板隔離

- Workspace 不載入 core.js、app.js、Google SDK 或 Pele；不使用 localStorage、IndexedDB、Drive API。
- 舊白板程式、Classic、Flow Plus、schemaVersion 3 及白板同步路徑不變。index.html 僅加一個新分頁連結。
- 不把新集合塞進舊白板 JSON，避免舊 normalize 丟掉未知欄位。
- 未來若要關聯白板，需另定 boardId＋cardId＋blockId＋nodeId 的外部參照契約，與刪除／失效提示。本版尚無白板物件連結，也不把圖內節點碼當全域 ID。

## Amendment 範例的可信度

種子檔 `assets/workspace-demo.json` 僅摘要已讀歷史設計資料，不含客戶個資、token 或文件全文。範圍文件 2026-05-09、工作紀錄 2026-05-09／10、6 月重構關係圖及 Roadmap 的來源位置與版本均保留。目標分階、關係整理及部分任務屬 POC 建議；目前狀態、負責人與交付日期不推測。

5 月 order_change_events 與 6 月 amendments 的差異留在註記。Prototype 存在只作設計產物佐證，不等於測試已通過。此種子檔是例子，不會掃描、更新或回寫原始專案文件。

## 測試與邊界

`npm run check`、`npm run test:workspace:unit`、`npm run test:workspace`。

2026-10-25 本次驗證：語法檢查通過，Workspace 單元 10/10、瀏覽器專項 8/8 通過。`npm run test:workspace:regression` 在獨立 4199 port 跑全部 112 項：111 通過、1 失敗。唯一失敗為既有 `expanded icon picker and clipboard screenshot paste preserve image layer`，在 `whiteboard.spec.cjs:205` 預期貼上後有 `.imgobj.below`，實際為 0；單獨重跑仍失敗，未修改的 `042073e` 基底在獨立 4201 port 亦重現相同失敗。因此不能報告整體全綠，也未在本分支修改該白板功能。測試使用本機 Chromium；未驗收 Safari 實機或真實 Google OAuth。

上述為 MVP 基準紀錄。探索介面 V1 另增加範圍投影、日期確認、端到端深入／返回、瀏覽器歷程、草稿保存、舊 MVP 檔原樣匯出、來源文字注入、可讀性與窄螢幕測試，結果以本次執行紀錄為準。另使用 ego-browser 檢視實際版圖、流程與待排期畫面；未回寫種子檔或原專案文件。

V1 最終驗證（2026-10-25）：語法檢查通過；12 項單元測試與 14 項 Workspace 瀏覽器測試全數通過。全部回歸 118 項中 117 通過，仍只有上述白板剪貼簿既有失敗，沒有擴張範圍修正。與 `78cb657` 種子資料比對，原 18 個物件、23 條關係、5 個來源、3 筆註記、5 份視角設定逐筆未變。新版範例僅追加版圖參考；舊檔匯入不自動追加資料。

Workspace Playwright 配置固定使用獨立 4198 port 且不重用伺服器，以免測到另一份 checkout。測試涵蓋不可變任務更新、多對多投影、來源保留、JSON 往返、錯誤匯入不覆寫、文字注入、白板儲存隔離、離開確認與窄螢幕布局。

本版不做新增／刪除物件 UI、關係編輯器、任務完整功能、日期排程編輯器、Roadmap 排程引擎、拖拉布局、Drive 同步、多人共編、Agent API 或自動匯入實際白板。外部進階欄位可隨 JSON 原樣往返，但不保證呈現；格式版本不支援則拒絕匯入。所有來源文字視為資料，不當成執行指令。
