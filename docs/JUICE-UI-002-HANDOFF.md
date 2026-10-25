# JUICE-UI-002｜巢狀卡片操作介面簡化交接

日期：2026-10-25。Repository：`aetherodie-cmyk/juice`。開發分支：`feature/juice-ui-002-card-actions`，以 `main` 的 `5b68291d25a7da4147aeb28d56feb426c9a3e715` 為基礎。本功能只提交至開發分支，未合併 `main`、未部署 GitHub Pages。

## 交付範圍

- 巢狀卡片預設為閱讀狀態：容器顯示箭頭與名稱，工作顯示名稱、必要的共用提示、狀態及負責人；類型／用途、顏色與操作按鈕不再每層常駐。箭頭只控制展開／收合，點名稱或卡面才選取卡片。點畫布空白處可取消選取。
- 選取後顯示單一「⋮」選單。容器可編輯名稱、類型／用途、顏色、建立子卡片、引用既有卡片；工作可開啟原有詳細資料編輯並改色。兩種卡片都把「移除此處引用」與「永久刪除原始卡片」分開顯示，沿用原本確認與保留子卡片的規則。
- 工作狀態與負責人仍可在卡面快速修改。建立子卡片直接新增既有 `objects`／`memberships` 結構，不產生臨時畫布卡片。容器改名更新同一穩定 ID，所有引用、表格及重載後的名稱一致。

## 畫面與本機驗收

[修改前後比較](juice-ui-002-comparison.md)使用相同的 OMG → 異動 → 工作清單 → 工作卡範例、1440 × 1100 視窗及 90% 縮放；另有[選取後選單](screenshots/juice-ui-002-selected.png)。修改前截圖來自上述 `main` 基準，修改後截圖來自本分支。

```sh
git clone --branch feature/juice-ui-002-card-actions https://github.com/aetherodie-cmyk/juice.git
cd juice
python3 -m http.server 4200 --bind 127.0.0.1
```

同一台電腦開啟 `http://127.0.0.1:4200/nested-cards.html`。先用箭頭展開四層，確認不因展開而出現選單；點「異動」名稱，從「⋮」改名、改用途或顏色，建立子工作，再按「儲存原型」並重載。另驗證共用工作兩處的狀態同步，以及移除單一引用與永久刪除原始卡片的不同效果。測試資料不要匯入正式白板。

## 修改入口與資料相容性

| 檔案 | 變更 |
| --- | --- |
| `assets/nested-app.js` | 選取狀態、集中選單、容器改名、新增子卡片、滑鼠／鍵盤／觸控入口。 |
| `assets/nested-cards.css` | 閱讀狀態、選取框及選單樣式；選取時才露出畫布卡拖曳把手。 |
| `assets/nested-core.js` | `patchContainer` 接受既有 `title` 欄位；`addChild` 使用既有物件與引用格式。 |
| `nested-cards.html` | 更新操作提示與靜態資產版本參數。 |
| `tests/nested-cards.spec.cjs`、`tests/nested-core.unit.cjs` | 選取、觸控、改名、新建子卡片、引用及保存回歸。 |
| `docs/nested-cards.md`、`docs/juice-ui-002-comparison.md`、`docs/screenshots/juice-ui-002-*.png` | 操作說明及修改前後證據。 |

仍使用 `juice-nested-board` version 1 與獨立 localStorage key `juice-nested-prototype-v1`。正式白板 JSON、Classic、Flow Plus、Google Drive 路徑及原始白板副本都未改寫。選取狀態只存在畫面記憶體中，不寫入 JSON。容器「類型／用途」沿用 `purpose`（一般容器、專案、功能、工作分組）；工作卡與容器卡的資料種類仍在建立時選擇，本次沒有加入兩者互轉或資料遷移。

## 測試與限制

在 Node.js 22 環境：`npm run check` 通過；巢狀資料單元測試 17／17、全站 Playwright 瀏覽器測試 130／130 通過。測試涵蓋既有四層展開、共用引用、讀取與保存重載，並使用 Chromium 觸控模擬驗證選取與開選單。尚未以手機實機驗收觸控與原生顏色選擇器。

這仍是獨立的 `nested-cards.html` 原型，沒有整合進正式白板畫布，也沒有同步至 Google Drive。若後續要發布，先核對最新 `main`、執行 PR CI，取得該次正式部署授權後才合併；不要把推送開發分支視為已發布。
