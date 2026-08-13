# url-download-preview Specification (delta)

## MODIFIED Requirements

### Requirement: 每頁勾選與跨頁狀態保留
前端 SHALL 提供「全選本頁 / 取消本頁」按鈕，只影響當前頁的影片。跨頁切換時，先前頁面的勾選狀態 SHALL 保留。

「全選本頁」對已下載影片的處理 SHALL 依全域「允許再次下載」開關決定（見 `redownload-override` capability）：開關為 OFF 時 SHALL 跳過已下載影片；開關為 ON 時 SHALL 與其他影片一視同仁地納入。「取消本頁」SHALL 移除當前頁中所有實際存在於 `downloadStore.selected` 的影片，不因該影片是否被標記為已下載而略過。

#### Scenario: 全選本頁
- **WHEN** 開關為 OFF，使用者點擊「全選本頁」
- **THEN** 當前頁中所有尚未勾選且尚未被標記為「已下載」的影片 SHALL 被加入 `downloadStore.selected`；已下載的影片維持停用、未被加入

#### Scenario: 開關 ON 時全選本頁納入已下載影片
- **WHEN** 開關為 ON，使用者點擊「全選本頁」
- **THEN** 當前頁中所有尚未勾選的影片（含已被標記為「已下載」者）SHALL 被加入 `downloadStore.selected`

#### Scenario: 取消本頁
- **WHEN** 使用者點擊「取消本頁」
- **THEN** 當前頁中所有目前已勾選的影片 SHALL 從 `downloadStore.selected` 移除；其他頁面的勾選狀態維持不變

#### Scenario: 取消本頁可移除已下載但已選取的影片
- **GIVEN** 使用者曾在開關 ON 時將某已下載影片加入 `downloadStore.selected`
- **WHEN** 使用者點擊「取消本頁」
- **THEN** 該影片 SHALL 從 `downloadStore.selected` 移除，不因其被標記為「已下載」而被略過

#### Scenario: 跨頁勾選保留
- **WHEN** 使用者在第 1 頁勾選了若干影片，再切換到第 2 頁
- **THEN** 第 1 頁的勾選 SHALL 透過 `downloadStore.selected` 保留；之後切回第 1 頁時影片 SHALL 仍呈現勾選狀態

#### Scenario: 已下載影片
- **WHEN** 預覽中某影片其 `video_id` 已存在於 `downloadStore.downloadedIds`，且開關為 OFF
- **THEN** 該影片的 checkbox SHALL 為停用狀態並顯示「✅ 已下載」徽章；「全選本頁」SHALL 不會把它加入 `selected`

#### Scenario: 開關 ON 時已下載影片可勾選
- **WHEN** 預覽中某影片其 `video_id` 已存在於 `downloadStore.downloadedIds`，且開關為 ON
- **THEN** 該影片的 checkbox SHALL 為可操作，其勾選狀態 SHALL 只反映它是否實際存在於 `downloadStore.selected`
- **AND** 「✅ 已下載」徽章 SHALL 仍然顯示
