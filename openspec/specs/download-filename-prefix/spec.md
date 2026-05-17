# download-filename-prefix Specification

## Purpose
TBD - created by archiving change prefix-downloads-with-sequence-number. Update Purpose after archive.
## Requirements
### Requirement: 下載檔名疊加流水號前綴

系統 SHALL 在每個下載產出的檔案名稱前加上 `nn_` 形式的流水號前綴。前綴 MUST 出現在 `_sanitize_filename` 已清洗過的標題之前、副檔名之外，例如 `01_My Awesome Song.mp3`。

前綴只是疊加，原始清洗邏輯（CJK、底線、空白等保留規則）與既有去重 (`-2`、`-3` 字尾) 行為 MUST 維持不變。

#### Scenario: 單檔下載加上 01_ 前綴
- **WHEN** 使用者在空的 `YYYYMMDD/` 資料夾中下載一支標題為 `Hello World` 的影片
- **THEN** 輸出檔名為 `01_Hello World.mp3`（或對應副檔名）

#### Scenario: 批次下載依順序遞增
- **WHEN** 使用者在空資料夾中一次下載 3 支影片
- **THEN** 三個輸出檔名依下載順序分別為 `01_<title1>.mp3`、`02_<title2>.mp3`、`03_<title3>.mp3`

#### Scenario: 標題清洗與前綴疊加順序
- **WHEN** 影片標題含被 `_sanitize_filename` 清掉的字元（例如 `Hello / World ★`）
- **THEN** 先清洗為 `Hello World`，再前綴成 `01_Hello World.mp3`，前綴本身不被清洗

### Requirement: 流水號依日期資料夾續編

系統 SHALL 在每次下載批次開始前，掃描該批次目標資料夾（`<output_root>/YYYYMMDD/`）中既有以 `^\d+_` 起始的檔案，取出最大的數字編號 `M`，並以 `M + 1` 作為本批次第一支影片的編號；同一批次內依序遞增。

掃描 MUST 涵蓋資料夾內所有副檔名（不限於 `.mp3` / `.mp4`），確保跨格式批次共用同一序號空間。資料夾為空或沒有任何符合 `^\d+_` 的檔案時，起始編號 MUST 為 `1`。

#### Scenario: 空資料夾從 01 起算
- **WHEN** 目標日期資料夾不存在或不含 `^\d+_` 命名的檔案
- **THEN** 本批次第一支影片編號為 `01`

#### Scenario: 已有檔案時延續最大值 + 1
- **GIVEN** 資料夾中已存在 `01_a.mp3`、`02_b.mp3`、`05_c.mp3`
- **WHEN** 使用者再下載 2 支影片
- **THEN** 新增的兩個檔案編號為 `06` 與 `07`（不填補中間缺號 03、04）

#### Scenario: 跨格式共用序號
- **GIVEN** 資料夾中已存在 `03_a.mp4`
- **WHEN** 使用者下載一支 `.mp3` 影片
- **THEN** 新檔編號為 `04`，不因副檔名不同而重置

### Requirement: 流水號位數與超過上限的擴充

流水號 MUST 預設以 2 位數零填充呈現（`01`、`02`、…、`99`）。當實際編號達到或超過 100 時，系統 SHALL 自動以實際位數呈現（`100_`、`101_`、…），不截斷亦不回繞至 `00`。

#### Scenario: 99 之前維持 2 位數
- **WHEN** 本批次計算出的編號 ≤ 99
- **THEN** 前綴 MUST 補零成 2 位（例如編號 7 → `07_`）

#### Scenario: 100 後自動擴充位數
- **GIVEN** 資料夾中既有最大編號為 `99`
- **WHEN** 下一支影片被加入
- **THEN** 新檔前綴 MUST 為 `100_`，不得截為 `00_` 或 `99_`

#### Scenario: 既有 3 位數編號被正確讀取
- **GIVEN** 資料夾中已存在 `120_old.mp3`
- **WHEN** 使用者下載一支新影片
- **THEN** 系統 MUST 解析出最大編號為 `120` 並產出 `121_<title>.mp3`

### Requirement: 前綴變更不影響 API Payload 與下游工具

`POST /download` 的請求 / 回應結構 MUST NOT 因加入前綴而變更。前端 UI 不需要感知前綴；任何在輸出資料夾上運作的後續工具（音量正規化、檔案列表 API）MUST 仍能以含前綴的實體檔名運作。

#### Scenario: API 介面保持相容
- **WHEN** 比較此變更前後的 `/download` request / response schema
- **THEN** 欄位（`videos`、`format`、`quality`、`task_id`…）MUST 完全相同

#### Scenario: 音量正規化能處理帶前綴檔名
- **GIVEN** 資料夾中有 `01_song.mp3`
- **WHEN** 透過 `run_normalize_batch()` 對該資料夾執行正規化
- **THEN** 流程 MUST 成功完成，不因前綴而被 `_sanitize_filename` 誤判為需要重新改名（底線與數字本即在保留集合內）

