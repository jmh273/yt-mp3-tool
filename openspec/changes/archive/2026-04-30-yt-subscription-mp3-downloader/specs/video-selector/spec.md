## ADDED Requirements

### Requirement: 勾選影片
系統 SHALL 允許使用者透過 checkbox 勾選一支或多支影片以加入下載佇列。

#### Scenario: 勾選單一影片
- **WHEN** 使用者勾選某支影片的 checkbox
- **THEN** 系統將該影片加入待下載清單，並顯示已選取數量

#### Scenario: 取消勾選
- **WHEN** 使用者取消勾選某支影片
- **THEN** 系統將該影片從待下載清單移除

### Requirement: 顯示已選取清單
系統 SHALL 在頁面底部或側邊顯示目前已選取的影片清單。

#### Scenario: 查看待下載清單
- **WHEN** 使用者勾選至少一支影片
- **THEN** 系統顯示所有已選取影片的標題與所屬頻道

### Requirement: 清除全部選取
系統 SHALL 提供「清除全部」按鈕，一次取消所有勾選。

#### Scenario: 清除全部選取
- **WHEN** 使用者點擊「清除全部」
- **THEN** 系統取消所有 checkbox 勾選，待下載清單清空
