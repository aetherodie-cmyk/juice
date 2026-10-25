# Juice Workspace 開發交接

更新日期：2026-10-25。交接範圍為 Workspace 本機實驗版，包含 UI-006 與圖層疊加修正。接手後應先啟動並重現現有功能，再與使用者確認下一項修改；不要重寫白板或自行部署。

## 版本與取得方式

- 專案：`https://github.com/aetherodie-cmyk/juice`。
- 本機目錄：`/Users/iriskao/Documents/blueodie/juice-workspace-mvp`。這是 Git worktree，不是旁邊的 `juice` 或 `juice-reader-mvp`。
- 開發分支：`codex/juice-ui-006-tree-and-native`。
- 最新功能提交：`be02e82fdbb9cd498fca868d02bd7b26f34448fc`，加入物件圖層順序。
- 前一提交：`e8dfec3`，合併樹狀工作表格、對齊自由物件外觀、重用圖形編輯器。
- UI-005 基準：`a2e3ff5`。更早的設計與限制可參考 `docs/JUICE-UI-003.md`、`JUICE-UI-004.md`、`JUICE-UI-005.md`。

這次沒有推送、合併 main 或部署。本機沒有這個分支的 `origin` 遠端追蹤參照；接手者不能假設 GitHub 已有本版。交接 ZIP 中的 `juice-ui006.bundle` 包含此分支及其 Git 歷史，後續文件提交也包含在內。

### 同一台電腦

```bash
cd /Users/iriskao/Documents/blueodie/juice-workspace-mvp
git status --short
git branch --show-current
python3 -m http.server 4210 --bind 127.0.0.1
```

若 4210 已有服務，先確認是否正提供這個目錄，不要直接終止其他人的程序。開啟 `http://127.0.0.1:4210/nested-cards.html?ui=006-layers`。

### 另一台電腦

解壓縮交接 ZIP，在含有 bundle 的目錄執行：

```bash
git clone --branch codex/juice-ui-006-tree-and-native juice-ui006.bundle juice-workspace
cd juice-workspace
git remote set-url origin https://github.com/aetherodie-cmyk/juice.git
python3 -m http.server 4210 --bind 127.0.0.1
```

安裝 Node.js 與 Python 3。靜態原型不需要建置；執行測試另需 `npm ci` 與 `npx playwright install chromium`。開發時使用 HTTP，不要直接雙擊 HTML 使用 `file://`。4210 僅是本機服務，不是正式站。

## 已完成的使用體驗

1. 專案、功能與工作群組可在白板原地展開／收合。工作卡可被多個容器引用，同一份資料同步更新。展開時周邊物件暫時避讓，收合後回到基準位置。
2. 右側只剩一張樹狀工作表格，第一欄保留階層，後續是狀態、負責人、期限、本階段範圍。工作列可直接編輯，支援篩選、同層排序、欄位顯隱、全畫面、停駐寬度與白板定位。
3. 同一工作可在多個樹狀位置出現，但唯一工作統計只計一次。容器顯示子工作摘要，不把完成數當成功能完成率。ID、路徑、歸屬等工程資訊放在列上的「⋯ 進階資訊」。
4. 只有工作卡依狀態顯示柔和整卡底色；容器保留手動配色。狀態色與表格共用獨立規則，規則可保存及匯出。
5. 一般文字卡、備註、圖片、內建與自訂圖示、流程圖可與結構卡共存。圖片／圖示沒有卡片外框，可拖曳本體、選取後用角落把手縮放。一般卡與流程可雙擊編輯。
6. 流程圖共用 Pele 安全顯示與 Classic 的 `JuiceFlowBuilder` 圖形編輯器；可雙擊節點設定名稱、短碼、形狀及連線。確認後才保存。來源白板的流程引用仍唯讀，不回寫 Classic。
7. 跨類型連線可指定起終點、箭頭及標籤，收合結構時連到可見上層，展開後回到工作。連線使用穩定 ID，不是 DOM 座標。
8. 圖層可「移到最上層、上移一層、下移一層、移到最下層」。自由物件選取後點「圖層」，或在白板卡片按右鍵；鍵盤可用 Shift＋F10。結構容器整組移層，內部階層不變。順序會保存，位置、尺寸與連線不變。

篩選時會暫時展開符合工作的祖先路徑，清除篩選後恢復原先收合狀態。一般說明、圖示與圖片不計入工作統計。

## 核心檔案

| 檔案 | 責任 |
| --- | --- |
| `nested-cards.html` | Workspace 入口與右側表格 UI |
| `assets/nested-core.js` | 結構物件、引用、主要歸屬、驗證、唯一統計與避讓 |
| `assets/nested-app.js` | 畫布、原地展開、選單、定位、連線、保存與跨類型圖層順序 |
| `assets/nested-views.js` | 單一樹狀工作表格、編輯、篩選、排序與進階資訊 |
| `assets/nested-cards.css` | Workspace 與自由物件外觀 |
| `assets/nested-color-rules.js` | 預設狀態色規則；使用者變更存入原型的 colorRules |
| `assets/workspace-native-core.js` | 自由物件、資產、流程引用與連線驗證 |
| `assets/workspace-native.js` | 自由物件 UI、上傳、拖曳／縮放接合、圖形編輯器接合 |
| `assets/workspace-flow-builder.css` | Workspace 對既有圖形編輯器的樣式接合 |
| `assets/core.js`、`pele-flow.js`、`flow-builder.js` | 共用既有能力，不要複製出第二套解析器 |
| `index.html`、`assets/app.js`、`assets/styles.css` | Classic；最近兩次功能提交沒有修改這些檔案 |

`workspace.html` 是較早的多視角探索原型，不是目前巢狀白板的主入口。

## 資料與隔離規則

格式仍是 `juice-nested-board` version 1；不要更換現有 ID 或重做資料模型。

- `board`：匯入的 Classic 原始副本，保持原樣。
- `boardPositions`：來源卡片的位置覆層，不改寫 `board` 座標。
- `objects`：正式結構物件與工作資料；`primary` 表示主要歸屬。
- `memberships`：容器到物件的引用關係；`placements`：根卡片的白板位置。
- `native.items` 與 `native.links`：新自由物件與跨類型連線。
- `ui`：展開、觀看、表格偏好；可選的 `ui.layerOrder` 按底層至頂層保存根物件順序，使用 `p:`、`b:`、`n:`、`s:` 類型前綴。刪除後失效的順序項會在顯示時忽略。圖層屬於呈現位置，不修改共享物件內容。
- `colorRules`：使用者保存的狀態規則。

明確點「儲存原型」才寫入 `localStorage` 的 `juice-nested-prototype-v1`。不讀寫 Classic 的正式儲存、IndexedDB 或 Google Drive。不同瀏覽器、通訊埠或主機的 localStorage 不共用；網址的 `?ui=` 參數不是新的資料空間。

**交接實際工作資料時，請使用者在目前瀏覽器按「下載原型 JSON」，另行提供給接手者。** ZIP 只含程式碼歷史、文件與示意截圖，沒有目前瀏覽器的工作資料。不要拿「匯出原白板」代替完整原型匯出：該按鈕只輸出 `board`，不包含 Workspace 新增內容。也不要將原型 JSON 匯入 Classic 覆蓋正式白板。

## 測試基準與驗收

```bash
npm ci
npx playwright install chromium
npm run check
npm run test:nested
npm run test:regression
```

- 圖層修正後：語法檢查通過，單元測試 36／36，Workspace 瀏覽器測試 53／53 通過。
- UI-006 在加入圖層修正前的完整回歸：154 通過、1 失敗。失敗是 `tests/whiteboard.spec.cjs:194`，剪貼簿貼圖未產生預期的 `.imgobj.below`，與較早基準相同。沒有繞過測試或修改 Classic 來消除它。
- 加入圖層後尚未重跑完整全站回歸；下一輪功能變更應重新執行，不能把上述 154／155 當成最新圖層版的完整回歸結果。
- `test:nested` 的獨立服務使用 4203，全站回歸使用 4205，預覽使用 4210。若測試埠被占用，先檢查，不要連到其他 checkout 的服務。

接手後至少手動核對：

1. OMG → 異動 → 工作清單可展開；修改 Prototype 確認的狀態、負責人、期限與範圍，白板與所有引用同步，統計仍為唯一工作數。
2. 表格收合、篩選、同層排序、全畫面及點名定位正常；工程欄位不出現在日常表格。
3. 新增一般文字卡與圖片／圖示，故意重疊，測試四種移層、拖曳與縮放。展開容器不破壞連線，收合後恢復基準位置。
4. 雙擊流程、開圖形編輯器、雙擊節點修改；確認後保存。流程引用同步，原始副本不被改寫。
5. 儲存、重新整理、完整原型 JSON 匯出再匯入，確認資料、圖層、引用、顏色與布局保留。另開 Classic 確認不受影響。

## 尚未完成與下一步界線

- 最新圖層操作已通過測試，但仍待使用者確認整體操作感受；沒有已核定的下一個開發項目。
- Classic 的完整富文字、undo／redo、框選／多選、群組操作、剪貼簿貼圖、圖片壓縮／裁切，以及完整 Flow Plus 尚未移入 Workspace。不要宣稱兩版完全等同。
- Classic 主畫布仍綁定 `app.js` 私有狀態；目前重用可公開接合的模組及 Workspace 既有畫布，而不是載入整個 Classic 應用。
- 匯入的原白板卡片內容、圖片、備註及圖示仍是來源預覽，不具有全部自由物件控制；不要偷偷寫回來源資料。
- 圖層是根物件的堆疊順序；不是 Photoshop 圖層面板，不包含鎖定、透明度或巢狀卡片內任意疊放。連線仍在物件後方。
- 流程手動節點位置沿用原文中的 `%% juice-positions` 註解保存。引用不複製原文；完整 Flow Plus metadata 仍保留在來源副本。
- 流程顯示需下載 CDN 的 Pele；離線或解析失敗時保留原文供閱讀。完整離線封裝尚未完成。
- 最大結構深度 8 層、顯示位置 500、自​​由物件 150、自由連線 300；上傳圖片每檔 5 MB，格式 PNG／JPEG／WebP／GIF；完整原型最多 20 MB。不要默默截斷資料。
- 不新增完整 Task／Roadmap、多人共編、權限或 Agent API。未確認的 OMG 負責人、日期、進度及業務規則不得自行推測。

## 畫面對照

- [修改前的 Workspace](screenshots/ui006-before.png)
- [UI-006 樹狀工作表格與自由物件](screenshots/ui006-after.png)
- [全畫面樹狀工作表格](screenshots/ui006-tree-fullscreen.png)
- [重用的流程圖編輯器](screenshots/ui006-flow-editor.png)
- [圖層順序選單](screenshots/workspace-layer-menu.png)

## 可直接交給下一位開發者的訊息

> 請接手 Juice Workspace 本機實驗版。先讀 docs/JUICE-UI-006-HANDOFF.md，使用 codex/juice-ui-006-tree-and-native 分支，不要從舊 main 重新做。先啟動 nested-cards.html，跑語法、單元與 Workspace 操作測試，再核對既有 OMG 範例及圖層功能。保留一份資料、多個引用與樹狀工作表格；Classic 與 Workspace 儲存隔離。接著向我確認下一項要修正的操作問題，再做最小範圍修改。不要自行推送、合併 main、部署或覆蓋正式資料。實際工作資料須由我另提供完整原型 JSON。
