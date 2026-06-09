## ADDED Requirements

### Requirement: 全站 toast 通知 store

系統 SHALL 提供一個全站共用的 toast store，維護一個通知佇列；每則通知 SHALL 含唯一 `id`、`type`（`success` / `error` / `info`）、`message` 文字，並 MAY 含逾時毫秒數。store SHALL 提供 `success(message)`、`error(message)`、`info(message)` 三個方法新增通知，以及 `dismiss(id)` 手動移除。任意元件 MUST 能匯入此 store 並觸發通知，不需經由 props 傳遞。

#### Scenario: 觸發成功通知

- **WHEN** 某元件呼叫 `toast.success('已訂閱')`
- **THEN** store 佇列新增一則 `type: 'success'`、`message: '已訂閱'`、具唯一 `id` 的通知

#### Scenario: 觸發錯誤通知

- **WHEN** 某元件呼叫 `toast.error('配額已用盡')`
- **THEN** store 佇列新增一則 `type: 'error'` 的通知

#### Scenario: 手動移除通知

- **WHEN** 對某存在的通知呼叫 `dismiss(id)`
- **THEN** 該通知 SHALL 自佇列移除

### Requirement: toast host 渲染與自動消失

系統 SHALL 提供一個掛載於 App 根的 toast host 元件，渲染 store 佇列中的所有通知；不同 `type` SHALL 以對應視覺樣式呈現（成功綠、錯誤紅、資訊中性）。每則通知 SHALL 在預設逾時後自動自佇列移除，且 SHALL 可由使用者手動關閉。佇列為空時 host MUST NOT 佔據可見版面。

#### Scenario: 通知自動消失

- **WHEN** 一則通知加入佇列且逾時到達
- **THEN** 該通知 SHALL 自動自佇列移除並從畫面消失

#### Scenario: 依類型呈現樣式

- **WHEN** host 渲染 `type: 'error'` 的通知
- **THEN** 該通知 SHALL 以錯誤（紅色）樣式呈現

#### Scenario: 空佇列不佔版面

- **WHEN** 通知佇列為空
- **THEN** host MUST NOT 顯示任何可見容器
