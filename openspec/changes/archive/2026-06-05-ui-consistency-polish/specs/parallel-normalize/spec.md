## ADDED Requirements

### Requirement: 正規化目錄選擇採用共用元件

正規化面板的目錄選擇 SHALL 使用共用的目錄選擇元件(輸入欄 + 尾端資料夾 icon + 彈窗),其資料夾清單 SHALL 取自不涉及 Drive 的工作資料夾列表端點。從彈窗選定資料夾 SHALL 僅將路徑填入輸入欄,MUST NOT 自動載入該目錄的檔案;載入仍由既有「載入」按鈕觸發。

#### Scenario: 從彈窗選資料夾只填路徑

- **WHEN** 使用者在正規化面板點輸入欄尾端的資料夾 icon 並於彈窗選定某資料夾
- **THEN** 目錄輸入欄 SHALL 更新為該資料夾路徑
- **AND** 系統 MUST NOT 自動掃描該目錄;檔案清單在使用者按「載入」前 SHALL 不變

#### Scenario: 彈窗清單不需 Drive 授權

- **WHEN** 使用者開啟正規化面板的資料夾彈窗
- **THEN** 清單 SHALL 來自不涉及 Drive 的工作資料夾列表端點
- **AND** 即使未授權 Drive,彈窗仍 SHALL 正常列出資料夾

#### Scenario: 仍可手動輸入路徑

- **WHEN** 使用者直接在目錄輸入欄輸入路徑
- **THEN** 既有「打路徑 → 按載入」流程 SHALL 維持可用,不受 picker 影響
