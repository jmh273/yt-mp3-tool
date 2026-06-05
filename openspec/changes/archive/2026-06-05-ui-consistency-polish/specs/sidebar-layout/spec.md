## ADDED Requirements

### Requirement: 左欄功能按鈕 icon 一致化

左欄頂部 5 個全域功能按鈕 SHALL 各自帶一個不重複的 emoji 前綴 icon,使視覺一致。其中「最新影片」按鈕 SHALL 以 🆕 為前綴;「同類新頻道」按鈕 SHALL 以 🧭 為前綴(取代先前與「搜尋影片」重複的 🔍)。任兩個功能按鈕 SHALL NOT 共用同一個 emoji 前綴。

#### Scenario: 最新影片有 icon 前綴

- **WHEN** 使用者載入首頁
- **THEN** 「最新影片」按鈕 SHALL 顯示 🆕 前綴,與其他帶 icon 的功能按鈕一致

#### Scenario: 同類新頻道改用不重複的 icon

- **WHEN** 使用者載入首頁
- **THEN** 「同類新頻道」按鈕 SHALL 顯示 🧭 前綴
- **AND** 五個功能按鈕(最新影片 🆕 / 發燒影片 🔥 / 搜尋影片 🔍 / 網址下載 🔗 / 同類新頻道 🧭)中 MUST NOT 有任兩個共用同一個 emoji

### Requirement: 訂閱頻道名稱 hover 顯示完整名稱

左欄「訂閱」清單中,當頻道名稱因寬度受限而被截斷時,系統 SHALL 透過原生 `title` 屬性讓使用者 hover 該名稱即可看到完整頻道名稱。

#### Scenario: hover 截斷的訂閱頻道名稱

- **WHEN** 某訂閱頻道名稱在清單中被截斷顯示
- **AND** 使用者將游標停在該名稱上
- **THEN** 瀏覽器 SHALL 以原生 tooltip 顯示該頻道的完整名稱
