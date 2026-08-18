# ytdlp-js-runtime Specification

## Purpose

定義 yt-dlp 解算 YouTube JavaScript challenge（nsig）所需的基礎建設：隨程式散布的 JavaScript runtime、EJS challenge solver、以及明確的 player client 選擇。缺少任一項時 YouTube 產出的媒體 URL 會被拒絕（HTTP 403），下載全面失敗。

## Requirements

### Requirement: 隨程式散布 JavaScript runtime

發行版 SHALL 內含一個可執行的 JavaScript runtime，與既有的 `ffmpeg`、`mp3gain` 同樣以 sidecar 二進位檔的形式散布。使用者 SHALL NOT 需要另行安裝 Node、Deno 或任何開發環境即可下載影片。

系統 SHALL 明確指定該 runtime 的路徑給 yt-dlp，SHALL NOT 依賴使用者機器的 PATH 上剛好存在可用的 runtime。

#### Scenario: 全新解壓即可下載
- **WHEN** 使用者解壓發行版並首次執行下載，機器上未安裝任何 JavaScript runtime
- **THEN** 下載 SHALL 正常完成
- **AND** 系統 SHALL NOT 要求使用者安裝額外元件

#### Scenario: 不受使用者 PATH 影響
- **GIVEN** 使用者機器的 PATH 上存在另一個版本的 Node 或 Deno
- **WHEN** 系統執行下載
- **THEN** 系統 SHALL 使用隨程式散布的 runtime，而非 PATH 上的版本

### Requirement: 隨程式散布 EJS challenge solver

發行版 SHALL 內含 EJS challenge solver（`yt-dlp-ejs` 或等效元件）。系統 SHALL NOT 於執行期從網路取得 solver script。

#### Scenario: 離線仍可解算 challenge
- **WHEN** 系統在無法連線到 GitHub 或 npm 的環境執行下載
- **THEN** challenge 解算 SHALL 正常運作，SHALL NOT 出現 solver script 被略過的警告

#### Scenario: nsig 正常解開
- **WHEN** 系統對一支公開影片執行下載
- **THEN** 系統 SHALL NOT 產生 `n challenge solving failed` 或等效的解算失敗訊息

#### Scenario: solver 可用性以實際載入判定
- **WHEN** 系統回報 EJS solver 狀態
- **THEN** 判定 SHALL 基於實際載入 solver 是否成功，SHALL NOT 僅依賴套件的 metadata
  （發行版不含 dist-info，只讀 metadata 無法區分「未安裝」與「已安裝但讀不到版本」）

### Requirement: 明確指定 player client

系統 SHALL 明確指定 YouTube player client，SHALL NOT 沿用 yt-dlp 的預設選擇。指定值 SHALL 為一組可用 client 的優先序清單，使單一 client 被封鎖時仍有退路。

預設清單 SHALL NOT 包含已知失效的 client。此清單 SHALL 可經設定覆寫，使 YouTube 調整封鎖對象時不需重新發版即可因應。

已知失效的 client 之所以失效，是因為它們需要 GVS PO Token。因此當使用者已供給 PO Token 時，系統 SHALL NOT 再過濾這些 client——否則供給的 token 永遠無法生效。

#### Scenario: 不使用預設 client 選擇
- **WHEN** 系統建立下載選項
- **THEN** 選項中 SHALL 含有明確的 player client 指定

#### Scenario: 單一 client 失效時仍可下載
- **GIVEN** 優先序清單中的第一個 client 已被 YouTube 封鎖
- **WHEN** 系統執行下載
- **THEN** 系統 SHALL 改用清單中的後續 client 完成下載

#### Scenario: 清單可由設定覆寫
- **WHEN** 使用者在設定中指定自訂的 player client 清單
- **THEN** 系統 SHALL 使用該清單，SHALL NOT 使用內建預設值

#### Scenario: 未供給 PO Token 時過濾需要 token 的 client
- **WHEN** 設定的清單含有需要 PO Token 的 client，且使用者未供給任何 token
- **THEN** 該 client SHALL 被過濾掉

#### Scenario: 已供給 PO Token 時不過濾
- **WHEN** 設定的清單含有需要 PO Token 的 client，且使用者已供給 token
- **THEN** 該 client SHALL 被保留，使供給的 token 能實際生效

### Requirement: 啟動時偵測 runtime 可用性

系統 SHALL 於啟動時檢查散布的 JavaScript runtime 是否存在且可執行。不可用時 SHALL 以明確訊息告警，SHALL NOT 無聲降級後在下載階段才以難以理解的錯誤失敗。

#### Scenario: runtime 缺失時明確告警
- **WHEN** 系統啟動而散布的 runtime 檔案不存在或無法執行
- **THEN** 系統 SHALL 記錄一則明確指出 runtime 不可用的訊息
- **AND** 該訊息 SHALL 說明下載功能將因此受影響
