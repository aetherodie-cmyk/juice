# Issue #17｜自由白板連線驗收

範圍：Classic 自由白板卡片間的連線；不更動 OMG 正式資料、Workspace 巢狀連線或流程圖內部的 Mermaid 連線。

## 操作

點選卡片間的線，拖曳兩端紅色圓點以選擇四邊任意入／出位置；拖曳中間空心控制點以調整路徑。浮動選單可在「曲線／直角」間切換，或按「重設自動」清除手動錨點與路徑。曲線有兩個控制點；直角折線有一個中央折點。原有連線預設維持舊路徑。

## 隔離測試結果

測試在本機 4213 埠的獨立白板，以 Issue 描述重建卡片與連線；未載入或修改正式 OMG 資料。原始的兩張紅線示意圖未隨 Issue 附件提供，以下是依文字案例重建的比較圖。

| 案例 | 操作 | 結果 | 畫面 |
| --- | --- | --- | --- |
| A：中台傳送訂單 → T02 | 選線 → 拖曳 T02 入點至左側 → 切直角 → 拖曳折點 → 重新載入 | PASS；箭頭貼在左邊界，折點、線型、錨點保留 | [修改前](screenshots/issue-17-case-a-before.png) · [控制點](screenshots/issue-17-case-a-controls.png) · [修改後](screenshots/issue-17-case-a-after.png) |
| B：找到可用客編？ → ERP | 同一線先由左側直角繞行，再切曲線由右側繞行；卡片不移動，重新載入 | PASS；始終只有一條業務連線，路徑與端點保留 | [修改前](screenshots/issue-17-case-b-before.png) · [左側走法](screenshots/issue-17-case-b-left.png) · [右側替代走法](screenshots/issue-17-case-b-right.png) |

## 資料與限制

- 本分支檢查：`npm run check` 通過；`npm run test:nested` 80/80 通過；Issue 專項 5/5 通過，涵蓋舊資料、案例 A/B、縮放及無關卡片移動；`npm run test:regression` 為 188/189 通過。唯一失敗是既有 `tests/whiteboard.spec.cjs:194` 剪貼簿貼圖測試，未修改該功能或測試。
- 連線仍以 `from`／`to` 指向原卡片；新增可選 `style`、`startAnchor`、`endAnchor`、`manual`、`curveControls`、`bend`。舊連線不需轉換；卡片移動與流程卡縮放時，錨點依卡片邊界更新，控制點與折點以相對偏移保留。
- 智慧避障、交叉線最佳化及多折點分段編輯不在 P0。直角模式提供單一中央折點；不會自動避開其他卡片。
- Workspace 對匯入 Classic 來源白板的連線仍使用自己的簡化預覽路徑，不呈現此處的手動路徑；來源資料不會被改寫。
