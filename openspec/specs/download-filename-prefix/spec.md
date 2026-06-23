# download-filename-prefix Specification

## Purpose
TBD - created by archiving change prefix-downloads-with-sequence-number. Update Purpose after archive.
## Requirements
### Requirement: 下載檔名疊加流水號前綴

系統 SHALL 預設在每個下載產出的檔案名稱前加上 `nn_` 形式的流水號前綴。前綴 MUST 出現在 `_sanitize_filename` 已清洗過的標題之前、副檔名之外，例如 `01_My Awesome Song.mp3`。

當 `POST /download` 請求的 `seq_enabled` 欄位為 `false` 時，系統 MUST 不加任何流水號前綴，輸出檔名等同 `<sanitized_title>.<ext>`。

前綴只是疊加，原始清洗邏輯（CJK、底線、空白等保留規則）與既有去重 (`-2`、`-3` 字尾) 行為 MUST 維持不變。

#### Scenario: 單檔下載加上 01_ 前綴
- **WHEN** 使用者在空的 `YYYYMMDD/` 資料夾中下載一支標題為 `Hello World` 的影片，且 `seq_enabled` 未指定或為 `true`，`start_seq` 未指定
- **THEN** 輸出檔名為 `01_Hello World.mp3`（或對應副檔名）

#### Scenario: 批次下載依順序遞增
- **WHEN** 使用者在空資料夾中一次下載 3 支影片，`seq_enabled` 未指定或為 `true`，`start_seq` 未指定
- **THEN** 三個輸出檔名依下載順序分別為 `01_<title1>.mp3`、`02_<title2>.mp3`、`03_<title3>.mp3`

#### Scenario: 標題清洗與前綴疊加順序
- **WHEN** 影片標題含被 `_sanitize_filename` 清掉的字元（例如 `Hello / World ★`），`seq_enabled` 為 `true`
- **THEN** 先清洗為 `Hello World`，再前綴成 `01_Hello World.mp3`，前綴本身不被清洗

#### Scenario: 關閉流水號前綴
- **GIVEN** 一支標題為 `Hello World` 的影片
- **WHEN** 使用者送出 `POST /download` 並帶 `seq_enabled: false`
- **THEN** 輸出檔名為 `Hello World.mp3`，且 `start_seq` 即使有帶值也 MUST 被忽略

### Requirement: 流水號依日期資料夾續編

當 `POST /download` 請求中 `seq_enabled` 為 `true` 且 **未提供** `start_seq` 時，系統 SHALL 在每次下載批次開始前掃描該批次目標資料夾（`<output_root>/YYYYMMDD/`）中既有以 `^\d+_` 起始的檔案，取出最大的數字編號 `M`，並以 `M + 1` 作為本批次第一支影片的編號；同一批次內依序遞增。

當 `start_seq` 有值時，系統 SHALL 以 `int(start_seq)` 作為第一支影片的編號，**忽略**資料夾掃描得到的 `M + 1`；同一批次內依序遞增。

掃描 MUST 涵蓋資料夾內所有副檔名（不限於 `.mp3` / `.mp4`），確保跨格式批次共用同一序號空間。資料夾為空或沒有任何符合 `^\d+_` 的檔案時，預設起始編號 MUST 為 `1`。

#### Scenario: 空資料夾從 01 起算
- **WHEN** 目標日期資料夾不存在或不含 `^\d+_` 命名的檔案，且 `start_seq` 未提供
- **THEN** 本批次第一支影片編號為 `01`

#### Scenario: 已有檔案時延續最大值 + 1
- **GIVEN** 資料夾中已存在 `01_a.mp3`、`02_b.mp3`、`05_c.mp3`
- **WHEN** 使用者再下載 2 支影片，`start_seq` 未提供
- **THEN** 新增的兩個檔案編號為 `06` 與 `07`（不填補中間缺號 03、04）

#### Scenario: 跨格式共用序號
- **GIVEN** 資料夾中已存在 `03_a.mp4`
- **WHEN** 使用者下載一支 `.mp3` 影片，`start_seq` 未提供
- **THEN** 新檔編號為 `04`，不因副檔名不同而重置

#### Scenario: 使用者指定起始號覆寫掃描結果
- **GIVEN** 資料夾中已存在 `01_a.mp3`、`02_b.mp3`
- **WHEN** 使用者下載 3 支影片並帶 `start_seq: "10"`
- **THEN** 新增的 3 個檔案編號為 `10`、`11`、`12`（不使用 `03` ~ `05`）

#### Scenario: 衝突不阻擋寫入（後端不檢查）
- **GIVEN** 資料夾中已存在 `05_existing.mp3`
- **WHEN** 使用者下載 2 支影片並帶 `start_seq: "05"`
- **THEN** 後端 MUST 接受此請求，由 `yt-dlp` 既有去重邏輯產出 `05_<new1>-2.mp3` / `06_<new2>.mp3` 之類的最終檔名，不報錯

### Requirement: 流水號位數與超過上限的擴充

當 `start_seq` 未提供時，流水號 MUST 預設以 2 位數零填充呈現（`01`、`02`、…、`99`）；達到或超過 100 時 SHALL 自動以實際位數呈現（`100_`、`101_`、…），不截斷亦不回繞至 `00`。

當 `start_seq` 有值時，**位數 SHALL 由 `start_seq` 字串長度決定**（`"01"` → 2 位、`"001"` → 3 位、`"100"` → 3 位）。同一批次內若實際編號超過 `10^width - 1`，系統 SHALL 自動以實際位數呈現（例：`start_seq="999"`、第 2 支 → `1000_`），不截斷亦不回繞至 `000_`。

`start_seq` MUST 為 1 ~ 10 位純數字字串；不符格式的輸入 SHALL 觸發 422 Unprocessable Entity。

#### Scenario: 99 之前維持 2 位數（預設行為）
- **WHEN** 本批次計算出的編號 ≤ 99 且 `start_seq` 未提供
- **THEN** 前綴 MUST 補零成 2 位（例如編號 7 → `07_`）

#### Scenario: 100 後自動擴充位數（預設行為）
- **GIVEN** 資料夾中既有最大編號為 `99`，`start_seq` 未提供
- **WHEN** 下一支影片被加入
- **THEN** 新檔前綴 MUST 為 `100_`，不得截為 `00_` 或 `99_`

#### Scenario: 既有 3 位數編號被正確讀取
- **GIVEN** 資料夾中已存在 `120_old.mp3`，`start_seq` 未提供
- **WHEN** 使用者下載一支新影片
- **THEN** 系統 MUST 解析出最大編號為 `120` 並產出 `121_<title>.mp3`

#### Scenario: 使用者輸入 "01" 沿用 2 位數
- **WHEN** 使用者下載 5 支影片並帶 `start_seq: "01"`
- **THEN** 5 個檔名前綴為 `01_`、`02_`、`03_`、`04_`、`05_`

#### Scenario: 使用者輸入 "001" 改用 3 位數
- **WHEN** 使用者下載 3 支影片並帶 `start_seq: "001"`
- **THEN** 3 個檔名前綴為 `001_`、`002_`、`003_`

#### Scenario: 起始號為 999 時自動擴充
- **WHEN** 使用者下載 3 支影片並帶 `start_seq: "999"`
- **THEN** 3 個檔名前綴為 `999_`、`1000_`、`1001_`（位數隨需要從 3 擴充為 4）

#### Scenario: 不合法的 start_seq
- **WHEN** 使用者送出 `POST /download` 並帶 `start_seq: "abc"` 或 `start_seq: ""` 或 `start_seq: "12345678901"`（超過 10 位）
- **THEN** 後端 MUST 回 422 Unprocessable Entity 且不啟動任何下載

### Requirement: 前綴變更不影響 API Payload 與下游工具

`POST /download` 的請求 / 回應結構 SHALL 維持向後相容：未帶 `seq_enabled` / `start_seq` 的舊客戶端行為等同 `seq_enabled=true`、`start_seq=None`，與既有自動命名行為完全一致。任何在輸出資料夾上運作的後續工具（音量正規化、檔案列表 API）MUST 仍能以含前綴或不含前綴的實體檔名運作。

#### Scenario: 舊版客戶端呼叫保持相容
- **WHEN** 客戶端送出 `POST /download` 但 payload 中沒有 `seq_enabled` 與 `start_seq` 欄位
- **THEN** 後端 MUST 套用 `seq_enabled=true`、`start_seq=None`，行為與本次變更前完全一致

#### Scenario: 音量正規化能處理帶前綴檔名
- **GIVEN** 資料夾中有 `01_song.mp3`
- **WHEN** 透過 `run_normalize_batch()` 對該資料夾執行正規化
- **THEN** 流程 MUST 成功完成，不因前綴而被 `_sanitize_filename` 誤判為需要重新改名（底線與數字本即在保留集合內）

#### Scenario: 音量正規化能處理無前綴檔名
- **GIVEN** 資料夾中有 `song.mp3`（使用者送出 `seq_enabled=false` 產生）
- **WHEN** 透過 `run_normalize_batch()` 對該資料夾執行正規化
- **THEN** 流程 MUST 成功完成，與既有處理無前綴檔名邏輯相同

### Requirement: 流水號預覽端點

系統 SHALL 提供 `GET /download/next-seq` 端點，回傳目標資料夾的 `next_seq`（字串、依預設 2 位數零填充規則）與 `existing`（已存在的數字陣列），供前端 UI 預填輸入框與做即時衝突警告。

端點 SHALL 接受可選的目標子資料夾參數（query `dir`），並以與 `POST /download` **相同**的解析規則處理：透過 `_resolve_output_child(output_path, dir)` 解析為 `<output_path>/<sanitized dir>`，套用相同的越界防護（拒絕 `..`、路徑分隔符、絕對路徑），掃描**該解析後的資料夾**取得 `existing` 與 `next_seq`。當未提供 `dir`（或為空）時，系統 SHALL 回退到當日日期資料夾 `<output_root>/YYYYMMDD/`，與既有行為一致（向後相容）。掃描得到的資料夾**MUST** 與同參數下 `POST /download` 實際寫入的資料夾相同，確保「預覽用的流水號」與「實際下載落點」永不脫鉤。

#### Scenario: 空資料夾
- **WHEN** 目標資料夾不存在或不含 `^\d+_` 命名的檔案
- **THEN** 回傳 `{ "next_seq": "01", "existing": [] }`

#### Scenario: 已有數個檔案
- **GIVEN** 資料夾中已存在 `01_a.mp3`、`02_b.mp3`、`05_c.mp4`
- **WHEN** 使用者呼叫 `GET /download/next-seq`
- **THEN** 回傳 `{ "next_seq": "06", "existing": [1, 2, 5] }`

#### Scenario: 既有編號超過 99
- **GIVEN** 資料夾中已存在 `120_old.mp3`
- **WHEN** 使用者呼叫 `GET /download/next-seq`
- **THEN** 回傳 `{ "next_seq": "121", "existing": [120] }`，`next_seq` 以實際位數呈現

#### Scenario: 帶 dir 參數掃描指定資料夾
- **GIVEN** `<output_path>/myalbum/` 內已存在 `01_a.mp3`、`02_b.mp3`，而當日日期資料夾 `<output_path>/YYYYMMDD/` 為空
- **WHEN** 使用者呼叫 `GET /download/next-seq?dir=myalbum`
- **THEN** 回傳 `{ "next_seq": "03", "existing": [1, 2] }`（掃 `myalbum` 而非當日資料夾）

#### Scenario: 未帶 dir 回退當日資料夾
- **WHEN** 使用者呼叫 `GET /download/next-seq`（不帶 `dir`）
- **THEN** 系統掃描當日日期資料夾 `<output_root>/YYYYMMDD/`，行為與本次變更前完全一致

#### Scenario: 預覽資料夾與實際下載落點一致
- **GIVEN** 前端即將以 `target_dir = "20260622_sports"` 下載
- **WHEN** 前端先以 `GET /download/next-seq?dir=20260622_sports` 取得起始號，隨後 `POST /download` 帶相同 `target_dir`
- **THEN** next-seq 掃描的資料夾與 download 寫入的資料夾為同一個，連續批次的序號接續不重複

#### Scenario: dir 越界被拒
- **WHEN** 使用者呼叫 `GET /download/next-seq?dir=../secret` 或帶絕對路徑
- **THEN** 後端 SHALL 拒絕並回錯誤，不掃描 `output_path` 之外的任何資料夾

### Requirement: 流水號設定 UI

前端 SHALL 在 `SelectedVideos.vue` 面板中提供「加流水號」勾選盒與「起始號」輸入框,並具備衝突即時警告。這些欄位 SHALL 在面板顯示時即呈現,**即使尚未選取任何影片**,使用者亦能預先檢視與調整。

- 「加流水號」勾選盒：預設勾選,狀態存於 `localStorage` key `yt_mp3_seq_enabled`；勾選 / 取消後立即寫回。
- 「起始號」輸入框：僅當勾選盒為 ON 時顯示。系統 SHALL 在面板掛載時即自動 `GET /download/next-seq`（帶當前目標資料夾）並把 `next_seq` 預填到輸入框(即使 `selected.length === 0`)。此外每次面板從「無選取」變為「有選取」、下載完成 (`downloading` 由 `true` 轉為 `false`)、**或「下載到」目標資料夾 (`targetDirPath`) 變動時**,亦 SHALL 重新 `GET /download/next-seq`(帶更新後的目標資料夾)並重新預填；使用者可自由覆寫。對 `targetDirPath` 的逐字輸入 SHALL 做去抖 (debounce) 以避免過於頻繁呼叫。
- 呼叫 `GET /download/next-seq` 時,前端 SHALL 帶上當前「下載到」資料夾的葉名 (`basename(targetDirPath)`) 作為 `dir` 參數,使預填的起始號與衝突警告對齊實際下載落點。
- 衝突即時警告：解析使用者輸入的字串為整數 `n0`(位數為輸入字串長度),檢查 `[n0, n0 + selected.length - 1]` 是否與 `existing` 有交集；若有,於輸入框下方顯示警告文字「⚠️ 與既有 0X 重複」,但「下載」按鈕仍可按。當 `selected.length === 0` 時,系統 SHALL NOT 計算範圍,亦 SHALL NOT 顯示衝突警告。

下載送出時,前端 SHALL 把 `seq_enabled` 與 `start_seq` 加進 `POST /download` payload；當勾選盒為 OFF 時,`start_seq` MUST 不送出(或送 `null`)。

#### Scenario: 未選取影片即顯示並預填起始號
- **GIVEN** 使用者開啟「下載」分頁但尚未勾選任何影片,且「加流水號」為勾選狀態
- **WHEN** 面板掛載完成
- **THEN** 「加流水號」勾選盒與「起始號」輸入框 SHALL 已顯示,且「起始號」SHALL 顯示帶當前目標資料夾的 `GET /download/next-seq` 回傳的預填值

#### Scenario: 改目標資料夾後重新預填起始號
- **GIVEN** 「下載到」原為當日日期資料夾,起始號顯示 `06`
- **WHEN** 使用者把「下載到」改為一個空的自訂資料夾 `myalbum`
- **THEN** 前端 SHALL（去抖後）以 `dir=myalbum` 重新 `GET /download/next-seq`,起始號更新為 `01`,衝突警告改以 `myalbum` 的既有檔案計算

#### Scenario: 連續兩批進同一自訂資料夾不重複
- **GIVEN** 使用者把「下載到」設為空的 `myalbum`,下載第一批 3 支(產生 `01_`、`02_`、`03_`)
- **WHEN** 下載完成後使用者再選 2 支下載(未改資料夾)
- **THEN** 下載完成觸發以 `dir=myalbum` 重抓,起始號為 `04`,第二批為 `04_`、`05_`,不與第一批重複

#### Scenario: 預設勾選且預填 next_seq
- **GIVEN** 使用者首次開啟 app,`localStorage` 無 `yt_mp3_seq_enabled`
- **WHEN** 使用者勾選任一影片
- **THEN** 「加流水號」勾選盒 SHALL 為勾選狀態,「起始號」輸入框 SHALL 顯示 `GET /download/next-seq` 回傳的值

#### Scenario: 關掉勾選盒時隱藏輸入框
- **WHEN** 使用者點掉「加流水號」勾選盒
- **THEN** 「起始號」輸入框 SHALL 從畫面消失或被停用,且 `yt_mp3_seq_enabled` 變為 `"false"`

#### Scenario: 下載完成後重新預填
- **GIVEN** 使用者剛完成一批下載,目標資料夾因此多了幾個 `^\d+_` 檔
- **WHEN** 使用者再勾選新的影片
- **THEN** 起始號輸入框 SHALL 顯示以**該目標資料夾**更新後的 `next_seq`

#### Scenario: 空輸入時退回後端 auto-scan
- **WHEN** 「加流水號」勾選盒為 ON 但「起始號」輸入框為空
- **THEN** 「下載選取影片」按鈕 SHALL 仍為可按狀態；送出時前端 MUST 僅帶 `seq_enabled: true` 不帶 `start_seq`,由後端依**實際目標資料夾**現況自動續編

