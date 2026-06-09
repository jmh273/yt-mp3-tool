## Why

目前右側「下載」面板（`SelectedVideos.vue`）整塊被 `v-if="download.selected.length > 0 || ..."` 包住，使用者在尚未勾選任何影片前完全看不到「下載到」目錄、流水號起始號、格式 / 品質等欄位，無法事先確認與調整。等到勾選影片時這些欄位才一次出現並即時抓取 `next-seq`，使用者只能在「已要下載」的狀態下臨時檢視，體驗較被動。

## What Changes

- 「下載」分頁的設定區（格式 / 品質、加流水號 / 起始號、下載到目錄、自動正規化上傳勾選）SHALL 在尚未選取任何影片時即顯示，讓使用者預先確認與調整。
- 目標資料夾預設值與流水號 `next-seq` 預填 SHALL 在面板掛載時（即使 `selected.length === 0`）即完成，而非僅在「無選取 → 有選取」時才觸發。
- 「下載選取影片」按鈕在無選取時 SHALL 維持停用，避免空批次下載；「清除全部」在無選取時亦無作用 / 停用。
- 已選取數量提示文字 SHALL 在無選取時呈現對應狀態（例如「尚未選取影片」），不影響其餘欄位顯示。
- 流水號衝突警告在無選取時 SHALL NOT 誤報（`selected.length === 0` 時不計算範圍）。
- 進度區與完成摘要維持原行為（僅在 `downloading` / 有進度時顯示）。

## Capabilities

### New Capabilities
<!-- 無新增能力 -->

### Modified Capabilities
- `download-target-folder`: 「下載前可選擇目標資料夾」由「下載開始前提供」放寬為「面板顯示時即提供並預填」，在尚未選取影片時即可檢視與調整目標資料夾。
- `download-filename-prefix`: 「流水號設定 UI」的預填觸發時機由「面板從無選取變為有選取時」改為「面板掛載時即預填」，並規範無選取時的欄位顯示與衝突警告不誤報。

## Impact

- 前端：`frontend/src/components/SelectedVideos.vue`（外層 `v-if` 條件、`onMounted` / `watch` 觸發 `fetchNextSeq` 的時機、「已選取」提示文字、按鈕停用條件、衝突警告 guard）。
- 測試：`frontend/src/tests/SelectedVideos.test.ts`、`SelectedVideosDateRollover.test.ts`、`SelectedVideosAutoPipeline.test.ts`（面板可見性與預填時機的斷言需更新）。
- 後端：無變更（沿用既有 `GET /download/next-seq`、`POST /download`）。
