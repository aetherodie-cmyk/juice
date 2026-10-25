# Workspace MVP · 獨立檔案開發預覽

入口：本機 `workspace.html`，或白板開始畫面的「Workspace 開發預覽」。入口開新分頁，不離開目前白板。此功能在 `codex/workspace-mvp` 分支，尚未合併或部署。

## 先試這條路

1. 用 HTTP 靜態伺服器開啟，例如 `python3 -m http.server 4200 --bind 127.0.0.1`。
2. 開啟 `http://127.0.0.1:4200/workspace.html`，按「載入 Amendment 範例」。
3. 右側修改 `T-DECISIONS` 狀態與負責人，按「儲存任務」。
4. 切換系統、Roadmap、工作、流程、成果，核對同一任務皆顯示新值；Case 的結果仍為待確認。
5. 按「下載 Workspace JSON」，確認檔案已保存。重新整理後匯入該檔，核對狀態、來源與關係仍在。

本版只在頁面記憶體編輯，不自動保存或同步。離開與替換有未匯出變更時會確認；瀏覽器的離開提示仍受其使用者互動限制，不能取代下載備份。下載完成由瀏覽器負責，不宣稱已實際寫入指定磁碟位置。

## 資料契約

獨立格式為 `format: juice-workspace, version: 1`，不接受白板 schemaVersion 3 或 juice-flow。

| 集合 | 用途 |
|---|---|
| objects | 穩定 id、kind、title、fields、revision、sourceRefs、note。任務 fields 保存唯一的 status 與 owner；未知為 null。 |
| relations | 穩定 id、fromId、predicate、toId、certainty、sourceRefs，容許多對多；來源／建議／確認分開。 |
| sources | id、title、locator、version、note。來源位置以純文字顯示，不自動載入、不執行。 |
| assertions | 保留欄位的待確認、衝突或人工編輯註記；不存另一份可編輯狀態。 |
| views | 視角 id、kind、title、layout。布局以物件 id 為鍵，獨立於內容；本版使用各視角自動布局，不開放拖拉，匯入的布局資料保留。 |
| changes | 任務編輯前後值、時間與物件 id；工作空間與物件 revision 同時遞增。 |

物件種類：system、module、goal、task、process、decision、case、evidence。id 為 1～100 位英數、底線或連字號；物件 id 在工作空間內唯一，不根據標題重算。各集合也驗證重複 id、關係與來源端點。單檔上限 2 MB、物件 1000、關係 5000、來源 200、註記 2000、視角 20、變更 1000 筆。

任務狀態：null 待確認、todo、doing、blocked、done。owner 為 null 或最多 100 字的名稱。本版只修改狀態與負責人；patchTask 不變更其他物件、目標、Case、關係、來源或原始註記。人工編輯註記與來源的未解問題同時保留，不把人工輸入說成歷史來源的結論。

五個視角透過相同 objects／relations 投影：系統樹、目標階段、狀態分組、流程路徑與工作覆層、決策／Case／產物關係。任務完成不自動關閉目標、不修改業務流程狀態、不標記測試通過。流程是本檔的關係摘要，不是 Classic／Flow Plus 圖形編輯器。

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

另以 ego-browser 實際操作任務狀態與負責人，再切到 Roadmap 核對同一任務在兩個目標下顯示相同值，並檢視桌面與 390 px 手機布局。測試期間修改的是範例副本，未回寫種子檔。

Workspace Playwright 配置固定使用獨立 4198 port 且不重用伺服器，以免測到另一份 checkout。測試涵蓋不可變任務更新、多對多投影、來源保留、JSON 往返、錯誤匯入不覆寫、文字注入、白板儲存隔離、離開確認與窄螢幕布局。

本版不做新增／刪除物件 UI、關係編輯器、任務完整功能、日期排程、Roadmap 排程、拖拉布局、Drive 同步、多人共編、Agent API 或自動匯入實際白板。外部進階欄位可隨 JSON 原樣往返，但不保證呈現；格式版本不支援則拒絕匯入。所有來源文字視為資料，不當成執行指令。
