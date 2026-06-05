## ADDED Requirements

### Requirement: 觀察名單頻道名稱 hover 顯示完整名稱

觀察名單面板中,當頻道名稱因寬度受限而被截斷時,系統 SHALL 透過原生 `title` 屬性讓使用者 hover 該名稱即可看到完整頻道名稱。

#### Scenario: hover 截斷的觀察名單頻道名稱

- **WHEN** 某觀察名單頻道名稱在面板中被截斷顯示
- **AND** 使用者將游標停在該名稱上
- **THEN** 瀏覽器 SHALL 以原生 tooltip 顯示該頻道的完整名稱
