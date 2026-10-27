# 個別使用者與 Google Drive

目前設計是每人使用自己的 Drive，並非多人同步編輯同一張白板。不需要先建立聚思會員資料庫；由 Google Identity Services 取得使用者同意，透過該使用者的短期 access token 操作 Drive。OAuth client ID 可以出現在前端；client secret、refresh token 不應放進靜態網站或公開 repository。

## 操作流程

- 預設雲端路線：登入 Google → 顯示目前帳號 → 選擇或建立 Drive 白板 → 編輯與同步。
- 本機路線：主動選擇「只在此裝置使用」→ 建立／選擇本機白板。登入不會自動把它上傳。
- 本機轉存：匯入 JSON 後仍是本機白板。使用「將目前本機白板另存至 Google Drive」，明確確認目標帳號與新檔名稱。轉存前先保存本機原稿及復原快照；禁止同名覆寫，上傳後回讀內容必須一致，才建立同步綁定。後續雲端修改使用同一檔案 ID；保留的本機原稿不隨之改動。失敗不切換，不把本機狀態誤報成已同步。
- 雲端白板授權到期或收到 401 時會鎖住編輯，回到登入畫面。未保存內容仍保留，不會自動改為本機編輯模式。
- 舊的未知同步狀態副本在選取 Drive 白板時，先呈現雙方名稱、卡片數、時間及前 12 張標題供辨識。可以取消、匯出、另存獨立本機白板，或保留復原快照再開啟雲端。這是版本摘要，不是逐字差異或自動合併。

## 帳號隔離

登入後用 Drive `about.get` 取得 `user.permissionId`、email、名稱；不增加完整 Drive 或 profile scope。尚未取得可靠帳號識別時不啟用雲端功能。雲端白板連結記錄 ownerId，每次登入選擇帳號。切換前先保存，保存失敗就取消切換；授權失效後改登入其他帳號，會先保留原帳號的復原資料，解除白板綁定，再載入新帳號的列表。寫入前確認帳號、token 與目前 file ID 沒有變更。

IndexedDB `drive-recovery:<permissionId>` 保留該帳號最近一次切換時的狀態，登入相同帳號後才能從正常流程恢復；另有最近 20 筆復原快照。這是防止操作混用，不是本機資料的安全邊界：localStorage、IndexedDB、匯出及本機白板沒有加密；共用同一瀏覽器設定檔的人仍可取得裝置上的資料。共用電腦應使用各自的瀏覽器設定檔／訪客模式。若要提供嚴格的共用裝置隱私，需要另設清除裝置資料與加密策略。

Drive API 的實際存取權由使用者 token 與 Google 權限控制，不由 ownerId 欄位授權。`drive.file` 只允許本 app 建立或使用者授權給本 app 的檔案，並非整個 Drive 檔案瀏覽器；手動搬入的既有 JSON 若未授權，不一定會出現在列表。日後需要挑選任意既有檔案時，可加 Google Picker。

## 開放其他人之前，由專案管理者確認

這些是 Google Cloud 端設定，程式碼與 GitHub Pages 發布不能證明目前設定；此次未讀取或修改 Google Cloud Console。

1. 在擁有目前 OAuth client ID 的 Google Cloud 專案啟用 Drive API，確認 Web application client 的 Authorized JavaScript origins 包含 `https://aetherodie-cmyk.github.io`（origin 不含 `/juice/`）；開發用 origin 分開列出。
2. 在 Google Auth Platform 的 Audience 確認 External。小範圍試用可用 Testing 並加入測試者（上限 100）；要開放一般 Google 使用者，需發布 OAuth app，依實際 Branding／驗證要求補齊應用程式名稱、聯絡資訊、首頁與隱私權政策。網站部署成功不等於 OAuth app 已對外開放。
3. Data Access 維持 `https://www.googleapis.com/auth/drive.file`。它是 non-sensitive scope，但品牌／基本驗證與平台政策仍須依 Console 要求處理，不能保證完全無須審查。公司或學校帳號還可能受管理員政策限制。
4. 使用至少兩個真實帳號（A/B）與兩種瀏覽器測試：登入與拒絕授權、各自建立白板、清單隔離、重新整理、到期重新登入、切換帳號、雲端保存失敗及復原。自動測試使用 mock OAuth／Drive，不代表真實 OAuth 公開設定已驗證。
5. 依用量監控 Drive API 配額與錯誤。此階段仍是個人白板跨裝置使用；多人共編需要另外設計版本合併、權限與同步協定。

## 官方參考

- [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Drive about.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get)
- [Google OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [OAuth policy compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
- [Web OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)
