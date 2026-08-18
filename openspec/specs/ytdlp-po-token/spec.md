# ytdlp-po-token Specification

## Purpose

定義 GVS PO Token（BotGuard）的供給與缺席時的行為。缺少 PO Token 時 YouTube 不提供 audio-only 串流格式，系統被迫下載完整的 progressive 影片再抽取音軌，造成音質降低與流量倍增。此能力讓使用者能在需要時自行供給 token 還原音質，並確保沒有 token 時仍能完成下載。

**範圍限制（實作時確立）**：自動產生 PO Token 需要 BotGuard 執行環境。經評估，現有唯一主流方案 `bgutil-ytdlp-pot-provider` 的 script 模式需要 clone 其 repo 並安裝含原生模組（`npm:canvas`）的相依，server 模式則需另行運行一個服務——兩者皆牴觸本產品「下載一包、解壓即用」的性質。因此本能力只涵蓋**手動供給**與**安全降級**，自動取得留待生態成熟後另案評估。

## Requirements

### Requirement: 供給 PO Token 以還原 audio-only 格式

系統 SHALL 允許使用者透過設定供給一組或多組 GVS PO Token，並於下載時傳遞給 yt-dlp，使需要 token 的 client 之 audio-only 格式重新可用。

設定值格式不合的項目 SHALL 被忽略，SHALL NOT 因設定錯誤而中斷下載。

#### Scenario: 有供給 token 時帶入下載選項
- **WHEN** 使用者已在設定中供給有效的 PO Token 且系統建立下載選項
- **THEN** 下載選項 SHALL 含有該 token

#### Scenario: 未供給 token 時不帶該選項
- **WHEN** 使用者未供給任何 PO Token
- **THEN** 下載選項 SHALL NOT 含有 token 欄位

#### Scenario: 格式不合的設定值被忽略
- **WHEN** 設定中含有格式不合的項目
- **THEN** 該項目 SHALL 被忽略，其餘有效項目 SHALL 正常帶入
- **AND** 下載 SHALL NOT 因此中斷

### Requirement: 缺少 PO Token 時安全降級

未供給 PO Token 時，系統 SHALL 降級為可用的 progressive 格式並完成下載，SHALL NOT 直接失敗。需要 token 的格式被略過一事 SHALL 出現在保留的下載警告中，使使用者能理解音質為何低於預期。

#### Scenario: 無 token 仍能完成下載
- **WHEN** 系統在未供給 PO Token 的情況下下載一支影片
- **THEN** 下載 SHALL 以 progressive 格式完成

#### Scenario: 降級不中斷批次
- **GIVEN** 一個批次含多支影片且未供給 PO Token
- **WHEN** 系統執行該批次
- **THEN** 所有影片 SHALL 以降級格式完成，SHALL NOT 因缺少 PO Token 而標記為失敗

#### Scenario: 降級原因可追查
- **WHEN** 因缺少 PO Token 而有格式被略過
- **THEN** 對應的 yt-dlp 警告 SHALL 被保留並寫入下載 log
