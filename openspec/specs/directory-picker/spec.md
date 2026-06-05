# directory-picker Specification

## Purpose

定義一個可重用的目錄選擇元件:呈現為路徑輸入欄,輸入欄尾端內含資料夾 icon,點擊開啟資料夾選擇彈窗。元件只負責「填路徑」——選定資料夾僅更新綁定的路徑值並關閉彈窗,不執行任何載入/掃描/上傳動作;資料夾清單一律由呼叫端傳入,元件本身不向後端取清單。並提供一個不涉及 Drive 的輕量工作資料夾列表端點,供不需 Drive 授權的消費者(如正規化面板)取得清單。

## Requirements

### Requirement: 共用目錄選擇元件

系統 SHALL 提供一個可重用的目錄選擇元件,呈現為一個路徑輸入欄,並在輸入欄尾端內含一個資料夾 icon。點擊該 icon SHALL 開啟資料夾選擇彈窗,列出由呼叫端提供的資料夾清單。元件 MUST NOT 自行向後端取得資料夾清單,清單一律由呼叫端(parent)以資料傳入;每筆資料夾 MUST 含 `name` 與 `directory`,並 MAY 含一個可選的標記(badge)文字。元件 SHALL 提供雙向綁定的路徑值,以及一個在使用者於彈窗選定資料夾時觸發的事件。

#### Scenario: 輸入欄尾端 icon 開啟彈窗

- **WHEN** 使用者點擊目錄選擇元件輸入欄尾端的資料夾 icon
- **THEN** 系統 SHALL 開啟資料夾選擇彈窗,列出呼叫端提供的每個資料夾的 `name`
- **AND** 對帶有 badge 的資料夾 SHALL 顯示該 badge 標記

#### Scenario: 清單由呼叫端提供

- **WHEN** 元件被掛載
- **THEN** 元件 MUST NOT 自行發出列出資料夾的後端請求
- **AND** 彈窗內容 SHALL 僅來自呼叫端傳入的資料夾清單

#### Scenario: 可手動輸入路徑

- **WHEN** 使用者直接在輸入欄輸入或修改路徑文字
- **THEN** 綁定的路徑值 SHALL 即時更新,不需開啟彈窗

### Requirement: picker 只填路徑、不執行動作

於彈窗選定一個資料夾時,元件 SHALL **僅**將該資料夾的 `directory` 填入路徑值並關閉彈窗。元件 MUST NOT 觸發任何資料載入、掃描或上傳等執行動作;執行一律交由各面板自身的動作按鈕負責。

#### Scenario: 選定資料夾只更新路徑

- **WHEN** 使用者在彈窗點選某資料夾
- **THEN** 路徑值 SHALL 更新為該資料夾的 `directory`
- **AND** 彈窗 SHALL 關閉
- **AND** 系統 MUST NOT 因此次選取而開始任何載入或上傳動作

### Requirement: 工作資料夾列表端點(非 Drive)

系統 SHALL 提供一個輕量後端端點,列出設定的 `output_path` 下的日期子資料夾,回傳每個資料夾的 `name` 與絕對 `directory` 路徑。此端點 MUST NOT 呼叫 Google Drive API,也 MUST NOT 需要 Drive 授權,供不涉及 Drive 的消費者(如正規化面板)取得資料夾清單。

#### Scenario: 列出 output_path 下的子資料夾

- **WHEN** 呼叫端請求工作資料夾清單
- **THEN** 系統 SHALL 回傳 `output_path` 下所有子資料夾的 `name` 與 `directory`
- **AND** 排序方式 SHALL 與 Drive 上傳改選彈窗一致(依名稱倒序)

#### Scenario: 不觸碰 Drive

- **WHEN** 呼叫端請求工作資料夾清單
- **THEN** 系統 MUST NOT 對 Google Drive 發出任何請求
- **AND** 即使使用者未授權 Drive,端點 SHALL 仍正常回傳清單
