# Classic 大型流程圖閱讀器 MVP

本功能只改善閱讀，沿用 Pele 1.9.0 與現有安全 SVG 輸出。獨立分支為 `codex/classic-flow-reader-mvp`，開發基準為 `eff9394`；不包含合併 main 或部署。

## 使用方式

- Classic 卡片、區塊編輯面板及流程圖編輯器提供「獨立檢視」。
- **符合視窗**：完整顯示 SVG；小圖不強制放大。
- **原尺寸 1:1**：一個 SVG 使用者單位對應一個 CSS pixel，不是對應裝置實體像素。
- **自訂縮放**：1–400%；Ctrl／⌘＋滾輪（含觸控板 pinch-wheel）以游標為中心縮放。
- 一般滾輪及觸控板維持雙軸捲動；滑鼠拖曳平移，觸控採原生捲動。
- **返回總覽**重設閱讀器為符合視窗；**關閉／Esc**返回開啟前的白板或 Classic 編輯器。
- 瀏覽器支援時提供全螢幕；受權限限制時仍可完整視窗閱讀。

## 實作及影響範圍

- `assets/flow-reader.js`／`assets/flow-reader.css`：掛在 `body` 的原生 modal dialog，位於 `#world` transform 外。
- `assets/app.js`：只接上 Classic 閱讀入口與目標查找。
- `index.html`：載入閱讀器資產；`package.json`：語法檢查與跨瀏覽器測試命令。
- 閱讀器複製已經由現有安全路徑渲染的 SVG，以 Shadow DOM 隔離 ID 及樣式。繼承必要 CSS 自訂屬性、保留 viewBox／子節點／文字／線條／樣式，只改檢視副本根 SVG 的顯示寬高及位置。
- 縮放直接設定 SVG layout width/height，不用 PNG、Canvas 或 transform 放大點陣表面。閱讀器不設 `will-change: transform`，也不改全站既有提示。
- 以原生捲動及每 frame 合併一次的 wheel 縮放處理大型 SVG；關閉會移除 SVG 副本及待處理動畫 frame。
- 原生 dialog 阻隔背景操作，並隔離白板快捷鍵、還原開啟入口焦點。

沒有資料模型、schema、儲存、復原紀錄或 Classic parser 的變更；不呼叫 Flow Builder serialize，不寫回 Mermaid／diagramPositions，不修改 Flow Plus。閱讀器使用開啟當下的檢視快照，重新開啟才取最新圖。

## 未來詳圖入口

```js
window.JuiceClassicFlows.openReader({cardId: 'card-id', blockId: 'diagram-block-id'});
```

此 API 只接受目前白板現有的 Classic diagram block；無效目標回傳 false。卡片折疊而沒有已掛載 SVG 時，透過原有安全 Pele helper 在脫離文件的容器渲染，不變更資料。MVP 不包含跨白板載入、網址深連結或混合式皇輿地圖。

## 驗證

```sh
npm ci
npm run check
npx playwright install chromium webkit
npm test
npm run test:reader
```

跨瀏覽器組使用本機 Google Chrome 與 Playwright WebKit；需要已安裝 Chrome。其專用測試 origin 為 `http://127.0.0.1:4191`，一般回歸為 4187。勿重用其他 checkout 的同埠伺服器。

閱讀器案例驗證：

- 44 節點向量圖在 100／200／400% 的實際 SVG 尺寸及 screen CTM；子節點／樣式保持一致，沒有圖片或 Canvas。
- 捲動、滑鼠拖曳、Ctrl-wheel、返回總覽、ResizeObserver、焦點、Esc、危險白板快捷鍵阻隔及全螢幕。
- 關閉後完整比較儲存字串、白板 transform、原 SVG 及選取狀態。
- 從 Classic 編輯器開啟再返回，不改包含未支援語法的原文。
- 使用公開合成資料建立 `tests/fixtures/reader-raster.html`，比較 transform＋will-change、transform 無提示、SVG 實際寬高三種方式，不改應用 CSS。

### 2026-10-24 實測紀錄

- Chrome 155.0.8059.86／WebKit 27.2 的 14 項閱讀器跨瀏覽器案例全部通過，含 100／200／400% 截圖。
- ego-browser 在 4191 透過 UI 建立獨立本機白板，將 44 節點皇輿圖作測試副本；正式站原白板沒有操作或覆寫。實際閱讀後儲存字串、SVG、白板視角及選取狀態皆相同。
- 44 節點、100% 的 60-frame 捲動觀察：frame 間隔 p50 約 33.4ms、p95 約 52.6ms。這是桌面環境下的 smoke measurement，非獨立效能基準，不保證 60fps；更大資料量仍需另測。
- 本機 Chrome 合成比較中，先以 20% 呈現再 transform 放大的 will-change 欄可重現模糊；無提示及實際 SVG 寬高欄較清楚。這支持合成快取因素，但不足以認定正式白板只有單一根因。
- Safari 26.6.2 的 WebDriver 因未啟用「允許遠端自動化」拒絕 session；沒有變更使用者設定。因此 WebKit 結果不等於已完成 Safari 實機驗收。
- 全套回歸為 101 通過、1 個既有 macOS 剪貼簿案例 `expanded icon picker and clipboard screenshot paste preserve image layer` 失敗；乾淨 `origin/main` 的同一案例亦可重現。該案例使用 `Control+V`，本次不修改無關剪貼簿邏輯。

截圖與本機實際業務圖測試資料留在工作目錄外，不納入公開 Git 內容。

## 下一階段（本次不實作）

混合式皇輿地圖由 Juice 原生系統疆域／模組卡片負責總覽，以 cardId／blockId 開啟獨立 Classic 詳圖。後續另規劃群組嵌套、跨卡片航線及資料一致性，不能用兩份各自維護的流程資料造成分歧。
