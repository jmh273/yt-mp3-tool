## MODIFIED Requirements

### Requirement: 流水號設定 UI

前端 SHALL 在 `SelectedVideos.vue` 面板中提供「加流水號」勾選盒與「起始號」輸入框,並具備衝突即時警告。這些欄位 SHALL 在面板顯示時即呈現,**即使尚未選取任何影片**,使用者亦能預先檢視與調整。

- 「加流水號」勾選盒：預設勾選,狀態存於 `localStorage` key `yt_mp3_seq_enabled`；勾選 / 取消後立即寫回。
- 「起始號」輸入框：僅當勾選盒為 ON 時顯示。系統 SHALL 在面板掛載時即自動 `GET /download/next-seq` 並把 `next_seq` 預填到輸入框(即使 `selected.length === 0`);此外每次面板從「無選取」變為「有選取」或下載完成 (`downloading` 由 `true` 轉為 `false`) 時亦 SHALL 重新預填；使用者可自由覆寫。
- 衝突即時警告：解析使用者輸入的字串為整數 `n0`(位數為輸入字串長度),檢查 `[n0, n0 + selected.length - 1]` 是否與 `existing` 有交集；若有,於輸入框下方顯示警告文字「⚠️ 與既有 0X 重複」,但「下載」按鈕仍可按。當 `selected.length === 0` 時,系統 SHALL NOT 計算範圍,亦 SHALL NOT 顯示衝突警告。

下載送出時,前端 SHALL 把 `seq_enabled` 與 `start_seq` 加進 `POST /download` payload；當勾選盒為 OFF 時,`start_seq` MUST 不送出(或送 `null`)。

#### Scenario: 未選取影片即顯示並預填起始號

- **GIVEN** 使用者開啟「下載」分頁但尚未勾選任何影片,且「加流水號」為勾選狀態
- **WHEN** 面板掛載完成
- **THEN** 「加流水號」勾選盒與「起始號」輸入框 SHALL 已顯示,且「起始號」SHALL 顯示 `GET /download/next-seq` 回傳的預填值

#### Scenario: 預設勾選且預填 next_seq

- **GIVEN** 使用者首次開啟 app,`localStorage` 無 `yt_mp3_seq_enabled`
- **WHEN** 使用者勾選任一影片
- **THEN** 「加流水號」勾選盒 SHALL 為勾選狀態,「起始號」輸入框 SHALL 顯示 `GET /download/next-seq` 回傳的值(例如 `01` 或 `08`)

#### Scenario: 關掉勾選盒時隱藏輸入框

- **WHEN** 使用者點掉「加流水號」勾選盒
- **THEN** 「起始號」輸入框 SHALL 從畫面消失或被停用,且 `yt_mp3_seq_enabled` 變為 `"false"`

#### Scenario: 跨會話保留 checkbox 狀態

- **GIVEN** 使用者上次把「加流水號」關掉,`localStorage.yt_mp3_seq_enabled === 'false'`
- **WHEN** 使用者重新開啟 app 並勾選影片
- **THEN** 勾選盒 SHALL 為「未勾選」狀態

#### Scenario: 起始號每次重新計算（不保留）

- **GIVEN** 使用者上次手動把起始號改為 `100`
- **WHEN** 使用者重新開啟 app
- **THEN** 起始號輸入框 SHALL 顯示新的 `next_seq` 預填值,**不顯示** `100`

#### Scenario: 無選取時不顯示衝突警告

- **GIVEN** `GET /download/next-seq` 回傳 `existing: [5, 6]`,使用者尚未選取任何影片
- **WHEN** 使用者把起始號改為 `05`
- **THEN** 輸入框下方 SHALL NOT 顯示任何衝突警告(因 `selected.length === 0`,不計算範圍)

#### Scenario: 衝突警告

- **GIVEN** `GET /download/next-seq` 回傳 `existing: [5, 6]`,使用者選取了 3 支影片
- **WHEN** 使用者把起始號改為 `04`
- **THEN** 輸入框下方 SHALL 顯示「⚠️ 與既有 05、06 重複」警告,但「下載選取影片」按鈕仍 SHALL 為可按狀態

#### Scenario: 下載完成後重新預填

- **GIVEN** 使用者剛完成一批下載,資料夾因此多了幾個 `^\d+_` 檔
- **WHEN** 使用者再勾選新的影片
- **THEN** 起始號輸入框 SHALL 顯示更新後的 `next_seq`(基於新的 `existing`)

#### Scenario: 輸入合法性 UI 限制

- **WHEN** 使用者在「起始號」輸入框輸入**非空**但含非數字字元或長度 > 10 的字串
- **THEN** UI SHALL 阻止輸入或在送出前顯示錯誤提示,「下載選取影片」按鈕 SHALL 停用直到輸入合法

#### Scenario: 空輸入時退回後端 auto-scan

- **WHEN** 「加流水號」勾選盒為 ON 但「起始號」輸入框為空(例如尚未完成預填、或被使用者手動清空)
- **THEN** 「下載選取影片」按鈕 SHALL 仍為可按狀態(惟仍需有選取影片才可按)；送出時前端 MUST 僅帶 `seq_enabled: true` 不帶 `start_seq`,由後端依資料夾現況自動續編
