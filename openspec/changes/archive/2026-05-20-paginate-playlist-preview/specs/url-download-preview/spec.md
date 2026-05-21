## ADDED Requirements

### Requirement: 網址預覽解析端點
系統 SHALL 提供一個後端端點，能夠接受使用者貼上的 YouTube 影片或播放清單網址，並回傳該網址所對應的影片清單。每筆影片至少包含 `video_id`、`title`、`thumbnail`、`url`、`channel_title`、`duration_seconds` 欄位，以便前端統一以 `VideoItem` 結構處理。

#### Scenario: 解析單一影片網址
- **WHEN** 使用者送出一個僅指向單一影片的網址（例如 `youtube.com/watch?v=...` 或 `youtu.be/...`）
- **THEN** 系統 SHALL 回傳僅含一筆 `VideoItem` 的清單

#### Scenario: 解析播放清單網址
- **WHEN** 使用者送出指向播放清單（含 `list=` 參數）的網址
- **THEN** 系統 SHALL 回傳該清單中所有影片的 `VideoItem` 陣列，保留原本播放清單順序

#### Scenario: 解析失敗
- **WHEN** 使用者送出無法被解析的網址（格式錯誤、影片被刪除、私人清單等）
- **THEN** 系統 SHALL 回傳 4xx 錯誤並附帶可讀的錯誤訊息，前端 SHALL 在預覽區顯示該錯誤而不是空清單

#### Scenario: 空網址
- **WHEN** 使用者未輸入任何網址即送出
- **THEN** 系統 SHALL 不發出後端請求，或者後端 SHALL 回傳 400 Bad Request

### Requirement: 解析結果分頁顯示
前端 SHALL 將解析回傳的影片清單以分頁方式顯示，每頁影片數量預設為 25，並提供 10 / 25 / 50 / 100 的切換選項。當解析結果為空時，分頁元件 SHALL 隱藏。

#### Scenario: 預設每頁 25 部
- **WHEN** 解析成功且回傳的影片數量大於 25
- **THEN** 預覽區 SHALL 只顯示第 1 頁的前 25 部影片，並在分頁列顯示 `第 1 / N 頁`，其中 `N = ceil(影片總數 / 25)`

#### Scenario: 切換每頁數量
- **WHEN** 使用者在每頁數量下拉選單選擇 10 / 25 / 50 / 100 其中之一
- **THEN** 預覽區 SHALL 依新數量重新切片，並把 `currentPage` 重置為 1

#### Scenario: 影片總數不超過每頁上限
- **WHEN** 解析回傳的影片總數小於或等於目前 `pageSize`
- **THEN** 預覽區 SHALL 顯示全部影片，且分頁列 SHALL 仍顯示 `第 1 / 1 頁`，但上一頁與下一頁按鈕應為停用狀態

#### Scenario: 解析結果為空
- **WHEN** 解析成功但回傳的影片陣列為空（例如清單沒有任何可解析影片）
- **THEN** 預覽區 SHALL 顯示「找不到影片」訊息，且分頁列 SHALL 不顯示

### Requirement: 分頁導覽
前端 SHALL 提供上一頁、下一頁、跳頁輸入框三種導覽方式，並在邊界正確停用對應控制項。

#### Scenario: 點擊下一頁
- **WHEN** 使用者在第 X 頁（X < 總頁數）點擊「下一頁」
- **THEN** `currentPage` SHALL 變為 X + 1，預覽區重新切片，並把網格捲到頂端

#### Scenario: 點擊上一頁
- **WHEN** 使用者在第 X 頁（X > 1）點擊「上一頁」
- **THEN** `currentPage` SHALL 變為 X - 1，預覽區重新切片，並把網格捲到頂端

#### Scenario: 邊界停用
- **WHEN** 目前位於第 1 頁
- **THEN** 「上一頁」按鈕 SHALL 為停用狀態；同理，位於最後一頁時「下一頁」SHALL 為停用狀態

#### Scenario: 跳頁輸入合法值
- **WHEN** 使用者在跳頁輸入框輸入 1 ~ 總頁數之間的整數並送出
- **THEN** `currentPage` SHALL 變為該數字並重新切片

#### Scenario: 跳頁輸入非法值
- **WHEN** 使用者在跳頁輸入框輸入小於 1、大於總頁數、或非整數的值
- **THEN** `currentPage` SHALL 維持不變，且輸入框 SHALL 顯示原本頁碼

### Requirement: 每頁勾選與跨頁狀態保留
前端 SHALL 提供「全選本頁 / 取消本頁」按鈕，只影響當前頁的影片。跨頁切換時，先前頁面的勾選狀態 SHALL 保留。

#### Scenario: 全選本頁
- **WHEN** 使用者點擊「全選本頁」
- **THEN** 當前頁中所有尚未勾選且尚未被標記為「已下載」的影片 SHALL 被加入 `downloadStore.selected`；已下載的影片維持停用、未被加入

#### Scenario: 取消本頁
- **WHEN** 使用者點擊「取消本頁」
- **THEN** 當前頁中所有目前已勾選的影片 SHALL 從 `downloadStore.selected` 移除；其他頁面的勾選狀態維持不變

#### Scenario: 跨頁勾選保留
- **WHEN** 使用者在第 1 頁勾選了若干影片，再切換到第 2 頁
- **THEN** 第 1 頁的勾選 SHALL 透過 `downloadStore.selected` 保留；之後切回第 1 頁時影片 SHALL 仍呈現勾選狀態

#### Scenario: 已下載影片
- **WHEN** 預覽中某影片其 `video_id` 已存在於 `downloadStore.downloadedIds`
- **THEN** 該影片的 checkbox SHALL 為停用狀態並顯示「✅ 已下載」徽章；「全選本頁」SHALL 不會把它加入 `selected`

### Requirement: 整體勾選進度顯示
前端 SHALL 在分頁列附近顯示「已選 X 部 / 共 Y 部」的整體狀態，其中 X 為 `downloadStore.selected` 在目前預覽結果中的數量，Y 為解析回傳的總影片數。

#### Scenario: 勾選計數更新
- **WHEN** 使用者勾選或取消勾選任一影片
- **THEN** 進度文字 SHALL 即時更新為新的 `X` 值

#### Scenario: 下載完成後更新
- **WHEN** 透過 `downloadStore` 完成下載，某影片從 `selected` 移除並加入 `downloadedIds`
- **THEN** 進度文字 SHALL 反映新的 `X` 值，且該影片在預覽中 SHALL 變為停用 + 顯示「✅ 已下載」

### Requirement: 不預設勾選任何影片
解析完成後系統 SHALL 不主動將任何影片加入 `downloadStore.selected`，包含單一影片的情況。所有勾選 SHALL 由使用者主動操作。

#### Scenario: 解析單一影片
- **WHEN** 解析回傳僅一部影片
- **THEN** 該影片的 checkbox SHALL 為未勾選狀態，需由使用者親自勾選後才會進入 `downloadStore.selected`

#### Scenario: 解析播放清單
- **WHEN** 解析回傳多部影片
- **THEN** 全部影片皆 SHALL 為未勾選狀態，亦不會觸發任何 `toggle` 呼叫

### Requirement: 分梯次下載工作流
系統 SHALL 支援讓使用者以「逐頁、逐批」的方式下載大型播放清單：使用者可在一頁內勾選並送出下載、等待完成後再回到預覽切換到下一頁繼續勾選。

#### Scenario: 完成一頁後繼續下一批
- **WHEN** 使用者於第 1 頁勾選若干影片並透過右側 `SelectedVideos` 觸發下載完成
- **THEN** 第 1 頁中那些已完成下載的影片 SHALL 變成「✅ 已下載」並停用 checkbox；使用者可切換到第 2 頁繼續勾選並下載，原本的解析結果 SHALL 不需重新查詢

#### Scenario: 變更每頁數量不影響已下載狀態
- **WHEN** 使用者下載了一些影片後在 UI 切換 `pageSize`
- **THEN** 已標記為「已下載」的影片 SHALL 仍維持已下載呈現；新切片下重新計算的頁面 SHALL 正確反映勾選與已下載狀態
