## ADDED Requirements

### Requirement: 專案授權條款

公開 repo MUST 包含一份頂層 `LICENSE` 檔，明確本專案原始碼的開源授權條款。

#### Scenario: repo 含 LICENSE

- **WHEN** 任何人造訪公開 repo
- **THEN** 根目錄存在 `LICENSE` 檔，內容為選定的開源授權

### Requirement: YouTube ToS 免責聲明

公開 repo 的 README MUST 包含 YouTube 服務條款相關免責聲明，說明本工具僅供個人使用、下載行為的風險由使用者自負。

#### Scenario: README 含免責

- **WHEN** 使用者閱讀公開 repo 的 README
- **THEN** 內含明確的「僅供個人使用 / 風險自負 / 可能違反 YouTube ToS」聲明

### Requirement: 公開內容去留規則

開源前 MUST 對下列內部內容做出明確去留決策並落實：`.claude/` 工作流設定、`openspec/` 開發史、`docs/` 內部筆記。被保留者視為有意公開，被移除者 MUST NOT 出現在公開 repo 的工作樹或後續 commit。

#### Scenario: 內部檔案決策落實

- **WHEN** repo 轉為公開前完成清理
- **THEN** 每一類內部內容（`.claude/`、`openspec/` 開發史、內部 `docs/`）皆有「保留」或「移除」的明確結果
- **AND** 決定移除者已自工作樹移除且加入忽略規則

### Requirement: 無個人密鑰外洩

公開 repo 的工作樹與 git history MUST NOT 包含任何真實 `client_secret.json`、token 或其他個人密鑰。

#### Scenario: 公開前密鑰稽核

- **WHEN** 開源前進行密鑰稽核
- **THEN** 確認 git 追蹤檔與 history 皆不含真實憑證
- **AND** `.gitignore` 持續涵蓋 `client_secret.json`、`token.json` 等敏感檔
