# download-resume Specification (delta)

## MODIFIED Requirements

### Requirement: 下載結束後失敗項可見且可重試
系統 SHALL 在下載任務結束（`downloading` 轉為 false）後，仍顯示本次的進度清單而非隱藏它，並將失敗項以錯誤（error）樣式標示，使使用者能辨識哪些影片需要重試。

失敗項 SHALL 一併顯示**失敗原因**（後端回報的錯誤字串），使使用者不需開啟開發者工具或 console 即可判斷是暫時性問題還是需要處理的問題。呈現方式 SHALL 與音量正規化面板的逐項錯誤顯示一致。

呈現為失敗的項目 SHALL 為自動重試已用盡後仍未成功者；仍在重試中的項目 SHALL NOT 呈現為失敗。

重試 SHALL 沿用既有路徑：失敗項仍在 `selected`，使用者再次按「下載選取影片」時，送出的下載批次僅含這些仍在 `selected` 的影片，不新增後端 API。系統 SHALL 提供清除殘留進度顯示的方式（「清除全部」一併清空進度顯示）。

#### Scenario: 結束後仍看得到哪幾支失敗
- **WHEN** 下載結束且有 1 支以上失敗
- **THEN** 進度清單維持可見，失敗影片以 error 樣式標出，而非整個清單消失只剩數字摘要

#### Scenario: 失敗項顯示失敗原因
- **WHEN** 一支影片在自動重試用盡後仍失敗
- **THEN** 該項目 SHALL 顯示後端回報的錯誤字串
- **AND** 使用者 SHALL NOT 需要開啟開發者工具或後端 console 才能得知原因

#### Scenario: 重試中不呈現為失敗
- **WHEN** 一支影片首次嘗試失敗但自動重試仍在進行
- **THEN** 該項目 SHALL NOT 以失敗樣式呈現

#### Scenario: 再按下載僅重試失敗項
- **WHEN** 部分失敗後，使用者未變更選取即再次按「下載選取影片」
- **THEN** 送出的批次僅含仍在 `selected` 的失敗影片，成功項不被重複下載

#### Scenario: 清除全部一併清掉殘留進度
- **WHEN** 下載結束後使用者按「清除全部」
- **THEN** `selected` 與進度顯示皆清空，先前的失敗紅字不再殘留

#### Scenario: 持久化不及於進度本身
- **WHEN** 下載結束後使用者重新整理頁面
- **THEN** 進度清單（progress）不保證重現，但失敗影片仍留在 `selected`（header 顯示「已選取 N 支」），重試路徑不中斷
