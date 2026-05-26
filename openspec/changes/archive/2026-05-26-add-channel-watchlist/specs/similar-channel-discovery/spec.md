## MODIFIED Requirements

### Requirement: 一鍵訂閱

系統 SHALL 移除「同類新頻道」影片卡片上的「➕ 訂閱」按鈕，改提供「👁 加入觀察名單」按鈕。卡片**不再因動作而淡出**；已加入觀察名單後按鈕變更為「✓ 已在觀察名單」並 disabled（單向動作，與「✓ 已訂閱」風格一致）。訂閱動作改由觀察名單面板承擔。

#### Scenario: 加入觀察名單

- **WHEN** 使用者在某影片卡片點擊「👁 加入觀察名單」
- **THEN** 該頻道 (`channel_id`、`title`、`thumbnail`) 加入觀察名單 store，`added_at` 為當下時間
- **AND** 卡片留在列表中，不淡出、不移除
- **AND** 該頻道後續所有出現在同類新頻道的卡片，按鈕 MUST 顯示為「✓ 已在觀察名單」且 disabled
- **AND** 無 YouTube API 呼叫，無配額消耗

#### Scenario: 已在觀察名單的頻道再次出現

- **WHEN** 候選池 reload 後，某已在觀察名單的頻道又出現在列表
- **THEN** 該頻道的卡片按鈕直接渲染為「✓ 已在觀察名單」並 disabled

#### Scenario: 不再有訂閱失敗 toast 從此卡片觸發

- **WHEN** 使用者在「同類新頻道」卡片點任何按鈕
- **THEN** MUST NOT 呼叫 `subscriptions.insert`
- **AND** MUST NOT 出現「訂閱成功」「訂閱失敗」相關 toast（這些 toast 改由觀察名單面板的「➕ 訂閱」動作觸發）

### Requirement: Tab UI 整合

系統 SHALL 在前端主介面新增獨立 tab「🔍 同類新頻道」，與既有「訂閱頻道」「熱門影片」「URL 下載」並列。

#### Scenario: Tab 顯示載入進度

- **WHEN** 使用者首次切到此 tab
- **THEN** UI 顯示分階段進度提示（例：「分析訂閱中…」「找出興趣關鍵字…」「挖掘相似頻道…」）
- **AND** fast phase 結果一回來就 render 第一批卡片
- **AND** full phase 結果在背景補完，使用者可看到列表逐步填充

#### Scenario: 卡片視覺與其他 tab 一致

- **WHEN** 此 tab 顯示影片卡片
- **THEN** 卡片視覺結構與既有 trending / 訂閱影片卡片一致（縮圖、標題、頻道名、發布時間、時長、勾選下載按鈕）
- **AND** 額外顯示「👁 加入觀察名單」按鈕與「★新頻道」badge
