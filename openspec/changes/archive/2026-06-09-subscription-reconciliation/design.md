## Context

實測（memory [[project_youtube_subscriptions_list_lag]]，2026-05-29）確認：`subscriptions.list` 的硬性不同步不會靠重讀 API 恢復；唯一完全獨立的事實來源是 Google Takeout `subscriptions.csv`。換 `order`、`forChannelId` 都共用同一份延遲資料，無效；`subscriptions.insert` 雖可靠但有副作用 + 50 quota，只能點驗極小集合。因此對帳必須以 Takeout 為基準，且**比對前要先用 `channels.list` 篩掉死頻道**，否則 Takeout 快照殘留的已終止頻道會被誤算成 API bug。

後端既有慣例：`require_credentials()` + `build("youtube","v3",...)`、`consume_quota(n)`；`subscriptions.list(mine=true)` 分頁見 [main.py:627-659](backend/main.py#L627)；`channels().list(part=..., id=...)` 見 [main.py:840](backend/main.py#L840)。本能力依賴改動 A 的 `app-toast` 做回饋。

## Goals / Non-Goals

**Goals:**
- 讓使用者用獨立來源（Takeout）親眼比對「Google 後端 vs API」，量化不同步並列出是哪些頻道。
- 正確區分死頻道（API 移除正確）與真正不同步（YouTube list 漏給）。
- 把「不知道怎麼匯出 Takeout」的痛點用引導 + 深連結吃掉。

**Non-Goals:**
- 不以 **API 自動**退訂再訂修復不同步——desync 頻道取不到 `subscription_id`，`subscriptions.delete` 無從呼叫（見 D5）。改提供「引導使用者手動再同步」。
- 不抓瀏覽器 cookie 走 innertube 模擬網站退訂（脆弱、灰色地帶，對自架工具不值得）。
- 不整合 Google Data Portability API（需 app 審核，對自架工具過重）。
- 不排程自動對帳（單次手動觸發即可）；唯「已處理」勾選會本地持久化（見 D5）。
- 不解析整檔上傳（client-side 解析，只送 channel_id）。

## Decisions

### D1：CSV 在前端解析，只送 channel_id 清單

前端用 `FileReader` 讀文字、split 行、取第一欄為 `channel_id`，保留 `title`/`url` 於前端 map 供結果顯示。送 `POST /subscriptions/reconcile {channel_ids:[...]}`。

- **為何不後端收檔**：專案目前無 `UploadFile`/multipart 先例；client 解析避免新增上傳依賴、不外送整檔、後端契約是純 JSON 易測（pytest 直接給 id 陣列）。死/活分類只需 id，title 前端已有。

### D2：差集 + 批次 channels.list 分類

後端：`api_ids = GET /subscriptions 的 channel_id 集合`；`missing = unique(input) − api_ids`；對 `missing` 每 50 個一批 `channels.list(part="id", id=",".join(batch))`，回傳含的 id = 活（desynced），不含 = 死（dead）。

- **為何 `part="id"`**：分類只需存在性，`id` part 最省。`maxResults=50` 是 channels.list 上限，逐批呼叫。
- **配額**：subscriptions.list 每頁 1（既有）+ channels.list `ceil(len(missing)/50)`；missing 通常個位數 → 多 1 quota。

### D3：精靈三步 + Takeout 深連結

`ReconcileWizard.vue`（modal 或獨立 view），三步：指引→上傳→結果。Step1 連結指向 Google Takeout YouTube 匯出頁；確切可預選 scope 的深連結 Google 支援程度不明，**最壞退回 takeout 首頁 + 圖文指引**（實作時驗證連結）。結果區把後端回傳的 `desynced` id 對應前端 CSV map 的 title/url 顯示，提供 `https://www.youtube.com/channel/<id>` 開啟連結。

### D4：進入點放訂閱分頁

在左欄訂閱分頁（[HomeView.vue](frontend/src/views/HomeView.vue) `activeLeftTab==='subscribed'` 區）加「訂閱對帳」按鈕開啟精靈，與「檢查更新日期」並排（`.action-row`）。不新增路由，沿用元件顯示/隱藏。

### D5：不同步只能「引導手動再同步」，不可 API 自動修

實測（jmh273@gmail.com，Takeout 67 vs API 52，missing 15、dead 0，全為活頻道）確認是 YouTube 端持久不同步。但 `subscriptions.delete` 需要 `subscription_id`，而它只能從 `subscriptions.list` 取得——desync 頻道**正好就是 list 看不到的那些**，故 API 無法 delete；`insert` 又因已訂閱回 409 no-op。唯一可行是**在 YouTube 網站手動退訂再訂**（memory 實測能強迫後端對帳）。

因此採「1b 引導手動再同步」：不同步區顯示手勢說明（已訂閱→取消訂閱→再訂閱）+ **漏訂警告**（退訂後務必再訂回，否則真的少一個訂閱）；每列「已處理」勾選存 localStorage（key 例如 `reconcile-done:<account>:<channel_id>`，按帳號命名空間避免跨帳號污染），重開精靈保留；顯示「已處理 X / N」。app 全程 0 API quota（操作在網站）。

- **為何不做 API 自動**：唯一能 delete 的 sub_id 對 desync 頻道拿不到；硬做只會半途漏訂或 no-op。
- **為何要持久化勾選**：15 個手動跑，跨 session 才不會忘記做到哪、避免重做或漏訂。

### D6：重新對帳重用已解析 channel_ids

結果頁「重新對帳」直接用前端已存的 `channels.value.map(c => c.channel_id)` 重新 `POST /subscriptions/reconcile`，把 `result` 設回 null→loading→新結果，不要求重新上傳 CSV。閉環驗證手動再同步是否生效。

- **注意同步延遲**：剛手動退訂再訂後 `subscriptions.list` 可能尚未反映，missing 不一定立即下降；UI 文案 MUST NOT 暗示「沒降＝失敗」。

## Risks / Trade-offs

- **Takeout CSV 欄位格式變動** → 解析失敗。**Mitigation**：以「第一欄含 `UC` 前綴」為主判據、容忍 BOM/空行；解析不到任何 id → 錯誤 toast 並要求重選。實作前拿一份真 CSV 對欄位。
- **Takeout 深連結無法預選 scope** → 使用者仍可能勾錯。**Mitigation**：Step1 圖文明確標示「只勾訂閱項目、格式 CSV」；連結退回首頁仍可用。
- **大量 missing 造成多次 channels.list** → 配額/延時。**Mitigation**：批次 50；missing 實務上很小。差集大代表帳號/auth 問題，屬另一診斷路徑（見 memory），非本功能要自動處理。
- **依賴改動 A 未完成** → toast 不存在。**Mitigation**：排程上 A 先 B 後（brief 已標明前提）。
- **手動再同步漏訂（最大風險）** → 使用者退訂後忘記再訂 → 真的少一個訂閱。**Mitigation**：手勢說明強調兩步、明確漏訂警告、「已處理」勾選需手動確認（隱含提醒「我已退訂並重新訂閱」）。
- **重新對帳未立即下降被誤解為失敗** → YouTube list 同步延遲。**Mitigation**：UI 標註「可能需稍候再比對」，不以數字未降判定失敗。
