# download-resume Specification

## Purpose
TBD - created by archiving change resilient-download-resume. Update Purpose after archive.
## Requirements
### Requirement: 待下載選取清單持久化
系統 SHALL 將前端的待下載選取清單（`useDownloadStore().selected`）持久化於瀏覽器 localStorage（鍵 `yt_mp3_selected`），使其在頁面重整、分頁關閉後重開、或後端重啟後仍存在。store 初始化時 SHALL 從該鍵載入；選取的任何變動（新增、移除、清空、下載完成後移除）SHALL 同步寫回。載入時若資料損毀（JSON 解析失敗）MUST 無聲忽略並以空清單啟動，不得拋錯中斷 store 建立。

#### Scenario: 選取後重整仍保留
- **WHEN** 使用者選取 5 支影片（尚未下載），隨後重新整理頁面
- **THEN** 重整後待下載清單仍為原本那 5 支，無需重新挑選

#### Scenario: 選取變動即時持久化
- **WHEN** 使用者切換某支影片的選取狀態（加入或移除）
- **THEN** localStorage `yt_mp3_selected` 立即反映最新的選取清單

#### Scenario: 清空後持久化為空
- **WHEN** 使用者按「清除全部」
- **THEN** `selected` 與 localStorage `yt_mp3_selected` 皆為空清單

#### Scenario: 損毀資料無聲忽略
- **WHEN** localStorage `yt_mp3_selected` 內容非合法 JSON
- **THEN** store 以空待下載清單啟動，不拋錯、不中斷頁面載入

### Requirement: 下載完成項自動移出選取清單並持久化
系統 SHALL 在某支影片下載完成（SSE 回報該項 `status==='done'`）時，將其移出 `selected` 並同步更新持久化內容；下載失敗（`status==='error'`）的影片 MUST 保留在 `selected` 中，作為重試的來源。

#### Scenario: 成功項移出、失敗項保留
- **WHEN** 一批 3 支影片下載結束，其中 2 支成功、1 支失敗
- **THEN** `selected` 僅剩該 1 支失敗影片，且持久化內容一致；重整後仍只剩該支

#### Scenario: 全部成功後清空
- **WHEN** 一批影片全部下載成功
- **THEN** `selected` 與其持久化內容皆為空

### Requirement: 下載結束後失敗項可見且可重試
系統 SHALL 在下載任務結束（`downloading` 轉為 false）後，仍顯示本次的進度清單而非隱藏它，並將失敗項以錯誤（error）樣式標示，使使用者能辨識哪些影片需要重試。重試 SHALL 沿用既有路徑：失敗項仍在 `selected`，使用者再次按「下載選取影片」時，送出的下載批次僅含這些仍在 `selected` 的影片，不新增後端 API。系統 SHALL 提供清除殘留進度顯示的方式（「清除全部」一併清空進度顯示）。

#### Scenario: 結束後仍看得到哪幾支失敗
- **WHEN** 下載結束且有 1 支以上失敗
- **THEN** 進度清單維持可見，失敗影片以 error 樣式標出，而非整個清單消失只剩數字摘要

#### Scenario: 再按下載僅重試失敗項
- **WHEN** 部分失敗後，使用者未變更選取即再次按「下載選取影片」
- **THEN** 送出的批次僅含仍在 `selected` 的失敗影片，成功項不被重複下載

#### Scenario: 清除全部一併清掉殘留進度
- **WHEN** 下載結束後使用者按「清除全部」
- **THEN** `selected` 與進度顯示皆清空，先前的失敗紅字不再殘留

#### Scenario: 持久化不及於進度本身
- **WHEN** 下載結束後使用者重新整理頁面
- **THEN** 進度清單（progress）不保證重現，但失敗影片仍留在 `selected`（header 顯示「已選取 N 支」），重試路徑不中斷

### Requirement: 還原的待下載選取在 UI 上可見且可逐筆管理
系統 SHALL 讓重整／重啟後還原的待下載選取「看得到、管得到」，而非只剩一個數字。下載面板（`SelectedVideos.vue`）SHALL 列出目前 `selected` 中每支影片的標題，並對每支提供逐筆移除控制項；移除即把該影片移出 `selected` 並同步更新持久化內容（沿用既有 `toggle` 路徑）。移除控制項在下載進行中（`downloading` 為 true）MUST 停用，避免批次執行中變動選取。

此外，使用者進入 app 時，系統 SHALL 一律將主畫面預設開在「最新影片」頁並自動載入該清單，使使用者一進來即有內容、且還原的待下載選取（落在最新時間窗內者）其勾選狀態立即可見，而非停在空白佔位頁。此預設僅作用於進入時的初始畫面，使用者之後切換分頁／頻道 SHALL NOT 被干擾。

#### Scenario: 重開後面板列出已選影片標題
- **WHEN** 使用者先前選取數支影片後關閉視窗，再重新進入 app
- **THEN** 下載面板除顯示「已選取 N 支影片」外，SHALL 逐列列出每支已選影片的標題，使用者無需重新搜尋即可辨識選了哪些

#### Scenario: 逐筆移除已選影片
- **WHEN** 使用者在面板的已選清單中點某支影片的移除控制項
- **THEN** 該影片 SHALL 從 `selected` 與其持久化內容移除，清單即時更新；其餘已選影片不受影響

#### Scenario: 進入 app 即落在最新影片頁
- **WHEN** 使用者進入 app（不論是否有還原的待下載選取）
- **THEN** 主畫面 SHALL 預設開在「最新影片」頁並自動載入；若有還原選取，落在最新時間窗內的已選影片在該清單中顯示為已勾選

