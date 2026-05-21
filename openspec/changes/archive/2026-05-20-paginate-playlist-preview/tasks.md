## 1. UrlDownloadFeed 分頁狀態與切片邏輯

- [x] 1.1 在 `frontend/src/components/UrlDownloadFeed.vue` 的 `<script setup>` 內新增 `pageSize = ref<number>(25)` 與 `currentPage = ref<number>(1)`
- [x] 1.2 新增 `totalPages = computed(() => Math.max(1, Math.ceil(videos.value.length / pageSize.value)))`
- [x] 1.3 新增 `pagedVideos = computed(() => videos.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))`
- [x] 1.4 新增 `selectedCount = computed(() => videos.value.filter(v => download.isSelected(v.video_id)).length)`，用於整體勾選進度顯示
- [x] 1.5 解析成功 (`handleParse` 完成) 後將 `currentPage.value = 1`，並移除「單一影片自動 toggle」的程式碼
- [x] 1.6 監看 `pageSize`：當下拉選單變動時將 `currentPage.value = 1`
- [x] 1.7 新增 `goToPage(n: number)`：clamp 在 `[1, totalPages]` 之間並 `currentPage.value = clamped`，同時把預覽網格捲到頂端

## 2. UrlDownloadFeed 模板更新

- [x] 2.1 將原本 `v-for="v in videos"` 改為 `v-for="v in pagedVideos"`
- [x] 2.2 在 `feed-header` 的 `actions` 區塊新增「每頁顯示」下拉選單，選項為 `10 / 25 / 50 / 100`，綁定 `pageSize`
- [x] 2.3 將既有「全選 / 全不選」按鈕改名為「全選本頁 / 取消本頁」，並修改 `selectAll / deselectAll` 函式只迴圈 `pagedVideos`
- [x] 2.4 在 `feed-header` 與網格之間新增分頁列，包含：上一頁按鈕、`第 X / Y 頁` 文字、下一頁按鈕、跳頁輸入框（Enter 觸發 `goToPage`）、與整體勾選進度文字「已選 X 部 / 共 Y 部」
- [x] 2.5 邊界停用：第 1 頁時上一頁按鈕 `:disabled="currentPage === 1"`；最後一頁時下一頁按鈕 `:disabled="currentPage === totalPages"`
- [x] 2.6 解析結果為空 (`videos.length === 0`) 時不渲染分頁列與下拉選單
- [x] 2.7 在標題列描述下方補一行提示「請勾選要下載的影片，按右側『開始下載』即可分批處理」

## 3. CSS / 樣式

- [x] 3.1 為新分頁列加上 scoped class（例如 `.pager`、`.pager-btn`、`.page-size-select`、`.selected-count`）
- [x] 3.2 確認在 `actions` flex 容器中下拉選單、勾選按鈕與分頁列在窄寬度下能 wrap，不會擠出版面
- [x] 3.3 跳頁輸入框使用 `inputmode="numeric"` 與 `min="1"`、`:max="totalPages"`，並設定固定寬度（約 60px）

## 4. 行為與整合驗證

- [x] 4.1 啟動 `_run_backend.bat` 與 `_run_frontend.bat`，在瀏覽器中以實際 YouTube 播放清單網址驗證解析後僅顯示當頁 25 部
- [x] 4.2 驗證切換每頁數量 (10 / 50 / 100) 後 `currentPage` 重置為 1 且網格內容立即更新
- [x] 4.3 驗證上一頁 / 下一頁 / 跳頁輸入框的行為與邊界停用
- [x] 4.4 驗證在第 1 頁勾選後切到第 2 頁再切回，第 1 頁勾選狀態保留
- [x] 4.5 驗證「全選本頁」只對當前頁影片生效，且不影響其他頁面已勾選狀態；「取消本頁」同樣只對當前頁生效
- [x] 4.6 驗證單一影片網址解析後不自動勾選；以及已下載影片在預覽中呈現停用 + 徽章
- [x] 4.7 驗證一頁勾選並下載完成後，那些影片變成「✅ 已下載」並從 `selected` 移除，再切下一頁繼續勾選後可正常進入下載流程

## 5. 既有測試 / 文件更新

- [x] 5.1 檢查 `ui-tests/` 內現有 Playwright walkthrough 是否有 URL 下載相關步驟，若有依賴「自動勾選單一影片」的斷言，調整為「主動點 checkbox」
- [x] 5.2 在 `test-report.html` 或對應的測試報告腳本更新對 URL 下載流程的描述，反映分頁與不預設勾選的行為
- [x] 5.3 視需要在 `README.md`「網址下載」段落補一句「大型播放清單以分頁顯示，預設每頁 25 部，可下拉切換」
