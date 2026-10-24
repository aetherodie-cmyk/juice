# Flow Plus Phase 1

Flow Plus 是 Juice 白板中的進階流程工作區。它以現有 Mermaid 文字保存節點、泳道與連線，並在同一張流程卡的 `diagram` 區塊 `aiContext` JSON 中保存結構化節點詳情。白板仍使用 `schemaVersion: 3`；不新增後端或資料欄位。Classic 的編輯器和既有流程資料不會被轉換。

從「更多工具」選「Flow Plus」可建立新工作區。既有流程則在 Classic 編輯器選「建立 Flow Plus 副本」；副本保留原有 Mermaid、節點編碼、泳道和連線，原圖留在白板上。若原文包含 Flow Builder 尚未支援的 Mermaid 語法，轉入會停止並顯示原因，不產生可能遺失連線的副本。

Flow Plus 顯示所有節點、條件標籤與跨泳道箭頭。節點卡片只顯示名稱、系統、重要條件與主要結果；點選節點在右側固定面板編輯步驟編號、階段、執行者、觸發時機、條件、動作、輸入、輸出、變更、說明、待確認事項及來源。未知的業務資料留空並顯示「待補充」。手機版將詳情面板改為底部抽屜。

`aiContext` 的 `flowPlus.version` 為 1，`flowPlus.nodes` 以既有節點 ID 為鍵。每筆節點含 `id`、`step`、`name`、`type`、`lane`、`stageId`、`actor`、`trigger`、`conditions`、`actions`、`inputs`、`outputs`、`effects`、`notes`、`questions`、`source`。Phase 1 中 `id`、`name`、`type`、`lane` 來自 Mermaid，詳情面板僅供閱讀；其他欄位可編輯，未填不會被臆測。整段 `aiContext` 上限為 50,000 字元，由既有 normalize 規則驗證。

圖形使用 `JuiceFlowBuilder.parse` 的共同模型，Flow Plus 只負責自己的閱讀畫面與詳情表單。Mermaid 原文仍可交給 Pele 顯示於白板卡片。Phase 1 預設完整展開；階段收合、路徑高亮、Flow Plus 中直接改節點或連線，以及任意 Mermaid 語法的無損轉入留待後續實作。舊版 Juice 雖能保存這張卡的 Mermaid 與 `aiContext`，仍應使用新版工作區編輯 Flow Plus 詳情。
