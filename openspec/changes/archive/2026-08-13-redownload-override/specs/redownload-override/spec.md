## Purpose

定義全域「允許再次下載」覆寫開關：一個應用層級、不持久化的開關，讓使用者在任一影片清單頁暫時解除「已下載」影片的選取封鎖，並統一所有清單頁對已下載影片的停用、勾選呈現與批次選取守門規則。此能力存在的原因是下載紀錄（`downloadedIds`）只增不減且持久化於 localStorage，若無覆寫手段，影片一經下載即永久無法再次選取。

## ADDED Requirements

### Requirement: 全域「允許再次下載」開關狀態

系統 SHALL 維護單一應用層級的「允許再次下載」開關狀態，由下載選取狀態的共用 store 持有，供所有影片清單頁共同讀取。此開關 SHALL 預設為 OFF，並 SHALL NOT 持久化到 localStorage 或使用者設定。

在單一瀏覽期間內，此開關的狀態 SHALL 於清單頁之間切換時保持不變；重新載入應用程式後 SHALL 回到 OFF。

#### Scenario: 首次載入預設關閉

- **WHEN** 使用者載入應用程式
- **THEN** 「允許再次下載」開關 SHALL 為 OFF

#### Scenario: 切換清單頁時維持開啟狀態

- **GIVEN** 使用者已將開關切為 ON
- **WHEN** 使用者從「最新影片」切換到「搜尋影片」或任一其他清單頁
- **THEN** 開關 SHALL 維持 ON，且該頁已下載影片的 checkbox SHALL 為可勾選

#### Scenario: 重新整理後回到關閉

- **GIVEN** 使用者已將開關切為 ON
- **WHEN** 使用者重新載入應用程式
- **THEN** 開關 SHALL 為 OFF

#### Scenario: 開關狀態不寫入設定

- **WHEN** 使用者切換開關後開啟設定頁
- **THEN** 設定頁 SHALL NOT 顯示任何對應此開關的持久化欄位
- **AND** 後端設定 SHALL NOT 因切換此開關而變更

### Requirement: 開關控制項位於全域 header

系統 SHALL 在首頁 header 區域提供標示為「允許再次下載」（或等義文字）的開關控制項，與 API 配額徽章、帳號切換等全域控制項並列。此控制項 SHALL 在所有影片清單頁瀏覽時皆可見且可操作，SHALL NOT 隨清單頁切換而隱藏或重置。

#### Scenario: header 顯示開關

- **WHEN** 使用者載入首頁
- **THEN** header SHALL 顯示「允許再次下載」開關控制項

#### Scenario: 開關不隨頁面切換消失

- **WHEN** 使用者在任一清單頁之間切換
- **THEN** header 的開關控制項 SHALL 持續可見，且其狀態 SHALL 不被重置

### Requirement: 已下載影片的停用與勾選呈現

所有影片清單頁 SHALL 以一致的規則呈現已下載影片的 checkbox。當開關為 OFF 時，已被標記為已下載的影片，其 checkbox SHALL 為 `disabled` 且 SHALL 呈現為已勾選狀態；當開關為 ON 時，該 checkbox SHALL 為可操作，且其勾選狀態 SHALL 只反映該影片是否實際存在於下載選取清單中。

「✅ 已下載」徽章 SHALL 在影片已被標記為已下載時持續顯示，不因開關狀態而改變。

此規則適用於全部影片清單頁：最新影片、頻道影片、發燒影片、搜尋影片、網址下載、同類新頻道。

#### Scenario: 開關 OFF 時停用並呈現已勾選

- **WHEN** 任一清單頁渲染一部已被標記為已下載的影片，且開關為 OFF
- **THEN** 其 checkbox SHALL 為 `disabled` 且呈現為已勾選
- **AND** 該卡片 SHALL 顯示「✅ 已下載」徽章

#### Scenario: 開關 ON 時解除停用且勾選狀態反映實際選取

- **GIVEN** 一部已被標記為已下載、且不在下載選取清單中的影片
- **WHEN** 開關切為 ON
- **THEN** 其 checkbox SHALL NOT 為 `disabled`
- **AND** 其 checkbox SHALL 呈現為**未**勾選
- **AND** 「✅ 已下載」徽章 SHALL 仍然顯示

#### Scenario: 開關 ON 時點擊有明確視覺回饋

- **GIVEN** 開關為 ON，且一部已下載影片的 checkbox 呈現未勾選
- **WHEN** 使用者點擊該 checkbox
- **THEN** 該影片 SHALL 被加入下載選取清單
- **AND** 其 checkbox SHALL 轉為已勾選
- **AND** 再次點擊 SHALL 將其移出選取清單並轉回未勾選

#### Scenario: 開關 OFF 時點擊不改變選取

- **WHEN** 開關為 OFF，使用者點擊已下載影片被停用的 checkbox
- **THEN** 下載選取清單 SHALL NOT 發生任何變化

#### Scenario: 已選取的已下載影片在開關 OFF 時的呈現

- **GIVEN** 一部已下載影片目前存在於下載選取清單中
- **WHEN** 開關為 OFF
- **THEN** 其 checkbox SHALL 為 `disabled` 且呈現為已勾選

### Requirement: 關閉開關不更動下載選取清單

將開關由 ON 切回 OFF SHALL 僅恢復 checkbox 的 `disabled` 呈現，SHALL NOT 從下載選取清單移除任何影片，亦 SHALL NOT 對選取清單做任何其他修改。使用者若要取消已加入的重複下載項目，SHALL 透過待下載清單自行移除。

#### Scenario: 關閉開關保留已選取的重複下載項目

- **GIVEN** 開關為 ON，使用者已選取 3 部已下載影片
- **WHEN** 使用者將開關切回 OFF
- **THEN** 那 3 部影片 SHALL 仍留在下載選取清單中
- **AND** 待下載數量 SHALL 維持不變

#### Scenario: 跨頁關閉開關不影響他頁選取

- **GIVEN** 使用者在「最新影片」頁於開關 ON 時選取了若干已下載影片
- **WHEN** 使用者切換到其他清單頁並將開關切回 OFF
- **THEN** 先前於「最新影片」頁選取的影片 SHALL 全部保留在下載選取清單中

#### Scenario: 保留的項目可正常下載

- **GIVEN** 下載選取清單中含有於開關 ON 時加入的已下載影片，且開關目前為 OFF
- **WHEN** 使用者觸發下載
- **THEN** 這些影片 SHALL 與其他新選取的影片一同下載，SHALL NOT 被特別排除

### Requirement: 批次選取動作遵循開關

清單頁若提供批次選取動作（例如「全選本頁」），該動作對已下載影片的處理 SHALL 依開關狀態決定：開關為 OFF 時 SHALL 跳過已下載影片；開關為 ON 時 SHALL 將已下載影片與其他影片一視同仁地納入。

#### Scenario: 開關 OFF 時批次選取跳過已下載影片

- **WHEN** 開關為 OFF，使用者觸發「全選本頁」
- **THEN** 當前頁中已下載的影片 SHALL NOT 被加入下載選取清單

#### Scenario: 開關 ON 時批次選取納入已下載影片

- **WHEN** 開關為 ON，使用者觸發「全選本頁」
- **THEN** 當前頁中所有尚未選取的影片（含已下載者）SHALL 被加入下載選取清單
