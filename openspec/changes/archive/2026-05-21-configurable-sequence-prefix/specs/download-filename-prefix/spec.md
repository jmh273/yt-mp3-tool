## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 流水號預覽端點

系統 SHALL 提供 `GET /download/next-seq` 端點，回傳當下日期資料夾（`<output_root>/YYYYMMDD/`）的 `next_seq`（字串、依預設 2 位數零填充規則）與 `existing`（已存在的數字陣列），供前端 UI 預填輸入框與做即時衝突警告。

#### Scenario: 空資料夾
- **WHEN** 目標日期資料夾不存在或不含 `^\d+_` 命名的檔案
- **THEN** 回傳 `{ "next_seq": "01", "existing": [] }`

#### Scenario: 已有數個檔案
- **GIVEN** 資料夾中已存在 `01_a.mp3`、`02_b.mp3`、`05_c.mp4`
- **WHEN** 使用者呼叫 `GET /download/next-seq`
- **THEN** 回傳 `{ "next_seq": "06", "existing": [1, 2, 5] }`

#### Scenario: 既有編號超過 99
- **GIVEN** 資料夾中已存在 `120_old.mp3`
- **WHEN** 使用者呼叫 `GET /download/next-seq`
- **THEN** 回傳 `{ "next_seq": "121", "existing": [120] }`，`next_seq` 以實際位數呈現

### Requirement: 流水號設定 UI

前端 SHALL 在 `SelectedVideos.vue` 面板中提供「加流水號」勾選盒與「起始號」輸入框，並具備衝突即時警告。

- 「加流水號」勾選盒：預設勾選，狀態存於 `localStorage` key `yt_mp3_seq_enabled`；勾選 / 取消後立即寫回。
- 「起始號」輸入框：僅當勾選盒為 ON 時顯示。每次面板從「無選取」變為「有選取」或下載完成 (`downloading` 由 `true` 轉為 `false`) 時，自動 `GET /download/next-seq` 並把 `next_seq` 預填到輸入框；使用者可自由覆寫。
- 衝突即時警告：解析使用者輸入的字串為整數 `n0`（位數為輸入字串長度），檢查 `[n0, n0 + selected.length - 1]` 是否與 `existing` 有交集；若有，於輸入框下方顯示警告文字「⚠️ 與既有 0X 重複」，但「下載」按鈕仍可按。

下載送出時，前端 SHALL 把 `seq_enabled` 與 `start_seq` 加進 `POST /download` payload；當勾選盒為 OFF 時，`start_seq` MUST 不送出（或送 `null`）。

#### Scenario: 預設勾選且預填 next_seq
- **GIVEN** 使用者首次開啟 app，`localStorage` 無 `yt_mp3_seq_enabled`
- **WHEN** 使用者勾選任一影片
- **THEN** 「加流水號」勾選盒 SHALL 為勾選狀態，「起始號」輸入框 SHALL 顯示 `GET /download/next-seq` 回傳的值（例如 `01` 或 `08`）

#### Scenario: 關掉勾選盒時隱藏輸入框
- **WHEN** 使用者點掉「加流水號」勾選盒
- **THEN** 「起始號」輸入框 SHALL 從畫面消失或被停用，且 `yt_mp3_seq_enabled` 變為 `"false"`

#### Scenario: 跨會話保留 checkbox 狀態
- **GIVEN** 使用者上次把「加流水號」關掉，`localStorage.yt_mp3_seq_enabled === 'false'`
- **WHEN** 使用者重新開啟 app 並勾選影片
- **THEN** 勾選盒 SHALL 為「未勾選」狀態

#### Scenario: 起始號每次重新計算（不保留）
- **GIVEN** 使用者上次手動把起始號改為 `100`
- **WHEN** 使用者重新開啟 app 並勾選影片
- **THEN** 起始號輸入框 SHALL 顯示新的 `next_seq` 預填值，**不顯示** `100`

#### Scenario: 衝突警告
- **GIVEN** `GET /download/next-seq` 回傳 `existing: [5, 6]`，使用者選取了 3 支影片
- **WHEN** 使用者把起始號改為 `04`
- **THEN** 輸入框下方 SHALL 顯示「⚠️ 與既有 05、06 重複」警告，但「下載選取影片」按鈕仍 SHALL 為可按狀態

#### Scenario: 下載完成後重新預填
- **GIVEN** 使用者剛完成一批下載，資料夾因此多了幾個 `^\d+_` 檔
- **WHEN** 使用者再勾選新的影片
- **THEN** 起始號輸入框 SHALL 顯示更新後的 `next_seq`（基於新的 `existing`）

#### Scenario: 輸入合法性 UI 限制
- **WHEN** 使用者在「起始號」輸入框輸入**非空**但含非數字字元或長度 > 10 的字串
- **THEN** UI SHALL 阻止輸入或在送出前顯示錯誤提示，「下載選取影片」按鈕 SHALL 停用直到輸入合法

#### Scenario: 空輸入時退回後端 auto-scan
- **WHEN** 「加流水號」勾選盒為 ON 但「起始號」輸入框為空（例如尚未完成預填、或被使用者手動清空）
- **THEN** 「下載選取影片」按鈕 SHALL 仍為可按狀態；送出時前端 MUST 僅帶 `seq_enabled: true` 不帶 `start_seq`，由後端依資料夾現況自動續編
