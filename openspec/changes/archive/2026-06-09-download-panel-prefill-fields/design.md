## Context

`SelectedVideos.vue`（右欄「下載」分頁）目前整塊內容被一個外層 `v-if` 包住：

```
v-if="download.selected.length > 0 || download.downloading || Object.keys(download.progress).length > 0"
```

因此在尚未勾選影片、也尚未下載時，面板完全空白。設定欄位（格式 / 品質、加流水號 / 起始號、下載到目錄、自動正規化上傳）只有在勾選影片後才一次出現。預填邏輯也綁在選取事件：

- `onMounted` 內 `fetchNextSeq()` 有 `if (download.selected.length > 0)` 的 guard。
- `watch(() => download.selected.length, ...)` 僅在 `0 → >0` 時呼叫 `fetchNextSeq()`。
- `loadSettings()`（計算目標資料夾預設值）已在 `onMounted` 無條件執行，故目錄預設值其實已可在掛載時算出，但因外層 `v-if` 而看不到。

`seqConflict` computed 已有 `if (count <= 0) return []` 的 guard，無選取時不會誤報衝突——這點符合期望，僅需保留。

## Goals / Non-Goals

**Goals:**
- 面板的設定區在尚未選取影片時即顯示且預填，方便事先確認與調整。
- 流水號 `next-seq` 與目標資料夾預設值在面板掛載時即完成。
- 無選取時下載 / 清除動作維持安全（按鈕停用），衝突警告不誤報。

**Non-Goals:**
- 不變更後端 API（`GET /download/next-seq`、`POST /download` 不動）。
- 不變更進度區與完成摘要的顯示條件（仍依 `downloading` / 進度）。
- 不變更格式 / 品質 / localStorage 等既有預設值與持久化邏輯。
- 不調整其他分頁（正規化、上傳）。

## Decisions

### 決策 1：拆分外層 `v-if`——設定區常駐，進度區維持條件顯示

把單一外層 `v-if` 拆成兩段語意：

- **設定區（`.header`）**：常駐顯示（移除門檻），讓欄位在無選取時即可見。
- **進度區（`.progress-list`）與摘要（`.summary`）**：維持既有條件（`download.downloading` / `doneCount`）。

最外層 `.selected-panel` 容器改為永遠 render（移除其 `v-if`），避免空面板與佈局跳動。

**替代方案**：保留外層 `v-if` 但加上 `|| true`——語意混亂、留死碼，否決。

### 決策 2：掛載即預填，移除選取 guard

`onMounted` 內無條件呼叫 `fetchNextSeq()`（移除 `if (download.selected.length > 0)`）。`loadSettings()` 維持無條件呼叫（已是如此）。`watch(selected.length, 0→>0)` 的重新預填予以**保留**，以涵蓋「掛載時 next-seq 抓取失敗 / 之後資料夾變動」的情境並維持既有行為。`watch(downloading, true→false)` 重新預填亦保留。

**理由**：`fetchNextSeq` 本身對 401 / 網路錯誤已 try/catch 靜默，掛載即呼叫無副作用風險。

### 決策 3：「已選取」提示文字反映無選取狀態

`<span>已選取 {{ download.selected.length }} 支影片</span>` 在 `selected.length === 0` 時改顯示「尚未選取影片」（或等義文案），其餘欄位照常顯示。

### 決策 4：按鈕停用條件沿用既有

「下載選取影片」既有 `:disabled` 已含 `download.selected.length === 0`，無需改動。「清除全部」既有 `:disabled="download.downloading"`，補上 `|| download.selected.length === 0` 使無選取時停用（無作用按鈕避免誤導）。

## Risks / Trade-offs

- [掛載即打 `GET /download/next-seq`，未登入時多一次 401 請求] → `fetchNextSeq` 已 try/catch 靜默，不影響 UI；可接受。
- [既有測試斷言「無選取時面板不顯示」會失敗] → 屬預期破壞，於 tasks 內同步更新 `SelectedVideos*.test.ts` 的可見性與預填時機斷言。
- [空面板的視覺佈局（無進度時的留白）] → 透過「尚未選取影片」提示與既有 `.header` 樣式即可，無需新樣式；如有視覺問題再微調 CSS。
