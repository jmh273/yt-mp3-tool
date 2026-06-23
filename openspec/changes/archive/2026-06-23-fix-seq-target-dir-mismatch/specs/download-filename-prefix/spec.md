# download-filename-prefix Specification (delta)

## MODIFIED Requirements

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
