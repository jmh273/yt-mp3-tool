# download-target-folder Specification

## Purpose

讓使用者在下載前選擇本批的目標資料夾,並讓下載 API 支援目標資料夾覆寫,以取代後端寫死的 `output_path/YYYYMMDD/` 路徑。預設沿用今日日期資料夾以向後相容,並支援同一日多批下載各自落入獨立資料夾、序號互不干擾,同時對傳入路徑做安全處理以防越界。

## Requirements

### Requirement: 下載前可選擇目標資料夾

下載開始前,系統 SHALL 提供「下載到」對話框,讓使用者檢視並調整本批下載的目標資料夾名稱。對話框 SHALL 預設帶入今日日期字串 `YYYYMMDD`(本地時間),與既有 `output_path` 組成完整路徑。使用者未調整時,系統 SHALL 沿用預設日期資料夾,使行為與現行一致(向後相容)。

#### Scenario: 不調整直接下載沿用預設

- **WHEN** 使用者開啟下載對話框且未修改資料夾名稱即確認下載
- **THEN** 系統 SHALL 把檔案下載到 `<output_path>/<YYYYMMDD>/`,結果與現行寫死日期資料夾的行為相同

#### Scenario: 加標籤建立可區分的批次資料夾

- **WHEN** 使用者在對話框把資料夾名稱改為 `YYYYMMDD_<標籤>`(方案 C,例如 `20260601_運動`)並確認下載
- **THEN** 系統 SHALL 建立並下載到 `<output_path>/YYYYMMDD_<標籤>/`,不與同日其他批次混用同一資料夾

### Requirement: 下載 API 支援目標資料夾覆寫

下載 API SHALL 接受目標子資料夾覆寫參數(`target_dir`),用以取代後端寫死的 `output_path/YYYYMMDD/` 計算。未提供時,系統 SHALL 回退到今日日期資料夾。系統 SHALL 對傳入名稱做安全性處理,拒絕逃逸 `output_path` 之外的路徑(防止 `..` 或絕對路徑越界)。

#### Scenario: 帶 target_dir 下載

- **WHEN** 前端送出下載請求並帶 `target_dir = "20260601_運動"`
- **THEN** 後端 SHALL 在 `output_path` 下建立該資料夾並把檔案寫入其中

#### Scenario: 未帶 target_dir 回退預設

- **WHEN** 下載請求未包含 `target_dir`
- **THEN** 後端 SHALL 使用今日 `YYYYMMDD` 日期資料夾,維持既有行為

#### Scenario: 拒絕越界路徑

- **WHEN** 下載請求的 `target_dir` 含 `..`、路徑分隔符或絕對路徑,試圖寫到 `output_path` 之外
- **THEN** 後端 SHALL 拒絕該請求並回傳錯誤,不在 `output_path` 之外建立或寫入任何檔案

### Requirement: 支援一日多批

系統 SHALL 允許同一日內進行多批下載,各批落入各自的目標資料夾,彼此不覆蓋或混用序號。每批的序號前綴 SHALL 以該批目標資料夾內既有檔案為基準計算。

#### Scenario: 同日第二批使用獨立資料夾

- **WHEN** 使用者於同日先下載到 `20260601` 再下載到 `20260601_晚`
- **THEN** 兩批檔案 SHALL 各自存於對應資料夾,且第二批的序號前綴 SHALL 從其自身資料夾的既有檔案接續,不受第一批影響
