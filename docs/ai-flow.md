# AI 流程整理：複製貼上版

1. 開啟或建立流程圖，在編輯器按「讓 AI 幫我整理」。
2. 按「複製提示詞」，貼到任一 AI 對話，再描述作業。提示詞含目前流程；分享前可先檢查內容。
3. 回答 AI 的補問，確認步驟、判斷、退回路徑及資料保存方式。請 AI 提供最終匯入 JSON。
4. 回站台按「貼上 AI 結果」，貼入完整 JSON 或單一 json 程式碼區塊。
5. 按「驗證並預覽」，核對圖與待確認事項，再選「新增為流程圖」或「更新目前流程」。取消不會套用。更新前會保留復原備份。

這個版本不連接 AI API，也不自動傳送流程資料。只有使用者自行複製／貼上。圖形與文字仍可繼續手動編輯。questions／assumptions 保存在 diagram block 的可選 aiContext 字串，下一次複製提示詞時會帶上。

## 交換格式

```json
{
  "format": "juice-flow",
  "version": 1,
  "title": "訂單審核",
  "direction": "LR",
  "nodes": [
    {"id": "START", "label": "收到訂單", "type": "round"},
    {"id": "CHECK", "label": "資料完整", "type": "decision"}
  ],
  "edges": [
    {"from": "START", "to": "CHECK", "label": "送審", "dotted": false}
  ],
  "questions": ["資料不完整時由誰補件？"],
  "assumptions": []
}
```

第 1 版保持原樣，匯入與匯出不會自動產生泳道。需要按系統分組時使用第 2 版：頂層新增 `lanes`，節點可用 `lane` 指向泳道；沒有 `lane` 的節點留在泳道外。例子中的上游來源在泳道外，中台與 OMG 接單模組是兩個泳道；失敗通知從 OMG 指回中台，不包含未確認的重試或自動修復。

```json
{
  "format": "juice-flow",
  "version": 2,
  "title": "跨系統接單",
  "direction": "LR",
  "lanes": [{"id": "MIDDLE", "label": "中台"}, {"id": "OMG", "label": "OMG 接單模組"}],
  "nodes": [
    {"id": "UPSTREAM", "label": "上游交易結果", "type": "round"},
    {"id": "RECEIVE", "label": "接收交易結果", "type": "rect", "lane": "MIDDLE"},
    {"id": "ORDER", "label": "建立訂單", "type": "rect", "lane": "OMG"},
    {"id": "FAIL", "label": "接收失敗通知", "type": "rect", "lane": "MIDDLE"}
  ],
  "edges": [
    {"from": "UPSTREAM", "to": "RECEIVE", "label": "", "dotted": false},
    {"from": "RECEIVE", "to": "ORDER", "label": "送交接單", "dotted": false},
    {"from": "ORDER", "to": "FAIL", "label": "建立失敗", "dotted": false}
  ],
  "questions": [],
  "assumptions": []
}
```

完整的中台／OMG 示例見 [測試 JSON](../tests/fixtures/ORDER-MIDDLE-OMG-v2-example.json)。泳道最多 20 條，泳道編碼需符合節點編碼規則、不得與節點重複，名稱不可空白或含 Mermaid 控制符號；節點只能指向已宣告的泳道。nodes 最多 100、edges 最多 300；連線須指向存在的節點。type 為 rect、decision、round、circle、database、subroutine。名稱與條件最多 200 字，使用一般文字，不含 Mermaid 括號、引號等語法符號。貼入結果不會執行 HTML 或 JavaScript；預覽沿用安全的 Pele 渲染器。修改貼入文字後必須重新驗證，才能套用。

程式：assets/flow-ai.js 定義提示詞、驗證與貼上預覽；assets/app.js 處理備份及套用；assets/core.js 保留 aiContext。既有 schemaVersion 3 與 Drive 同步流程維持原設計。
