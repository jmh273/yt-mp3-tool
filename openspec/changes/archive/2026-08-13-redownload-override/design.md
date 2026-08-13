## Context

動機見 `proposal.md` — Why。此處只記錄影響技術取捨的現況。

目前有兩個彼此獨立的「已下載」訊號，範圍不同：

| 訊號 | 來源 | 範圍 | 可否撤銷 |
|---|---|---|---|
| `download.isDownloaded(id)` | 前端 `downloadedIds`，localStorage `yt_mp3_downloaded_ids` | 全部 6 個清單頁 | 否（append-only） |
| `v.downloaded_on_disk` | 後端掃描 `output_path` 全樹比對檔名 stem | 僅 `GET /latest-videos` | 不適用（每次請求重算） |

「允許再次下載」目前是 `LatestVideosFeed.vue` 的區域 `ref`，同時覆寫上述兩個訊號。其餘五頁只受第一個訊號影響，且沒有任何覆寫路徑。

兩個既有實作細節會直接影響本次改動：

1. 其餘五頁的 checkbox 綁的是 `:checked="isSelected(id) || isDownloaded(id)"`。只放寬 `:disabled` 而不動 `:checked`，會讓已下載影片在開關 ON 時恆為勾選——點擊照樣改變 `selected`，但畫面不動，看起來像壞掉。最新影片頁已經處理過這點（第二個 clause 帶 `&& !allowRedownload`）。
2. `download.selected` 是跨頁共用且持久化於 localStorage `yt_mp3_selected`。任何「關閉開關時清理選取」的邏輯都會作用於整份清單，不限當前頁。

## Goals / Non-Goals

**Goals:**

- 六個清單頁對「已下載」影片的 `disabled` / `checked` 判定收斂為單一規則，新增清單頁時可直接沿用。
- 開關狀態單一真相來源，跨頁一致。
- 開關語意純化為「呈現層的權限旗標」：只決定能不能選，不主動改動選取內容。

**Non-Goals:**

- 不處理 `downloadedIds` 的清除／撤銷（設定頁「清除下載紀錄」另案）。
- 不把 `downloaded_on_disk` 擴充到其他 endpoint。
- 不動 `UrlDownloadFeed` 的 `pageSize` 下拉與分頁器。
- 不引入虛擬捲動。

## Decisions

### D1：開關狀態放在 `download` store，而非新建 store 或 `provide/inject`

放進既有的 `useDownloadStore`。開關的語意完全依附於 `isDownloaded` / `selected`，兩者已在該 store；分開放會讓「判定已下載」與「覆寫已下載」跨兩個模組，讀 code 時要跳來跳去。

考慮過的替代方案：
- **新開 `useRedownloadStore`** — 單一 ref 撐不起一個 store，且會產生 store 間的隱性耦合。
- **`provide` / `inject` 從 `HomeView` 往下傳** — 六個元件層級不一（`ChannelVideos` 由 `HomeView` 直接渲染，其他也是），但 `SelectedVideos` 等元件未來若要讀取會被迫改結構；store 沒有這個限制。

### D2：不持久化，且不加 `watch`

`allowRedownload` 只宣告為 `ref(false)`，不寫 localStorage、不註冊任何 `watch`。

理由是「危險模式不該在使用者不知情的狀況下跨 session 存活」。使用者關掉 app 隔天回來，預期是保護狀態而不是解除保護。重新整理即回到 OFF 是刻意設計的安全閥。

代價：批次重抓的過程中若重新整理，開關會被打回 OFF。但選取清單（`selected`）本身有持久化，已勾選的項目不會遺失——這正是 D3 的直接好處。

### D3：ON→OFF 不清理 `selected`（B2）

刪除 `LatestVideosFeed.vue` 現有的 `watch(allowRedownload, ...)`，不在 store 或 header 重建等價邏輯。

理由：
- **權限收回不該回溯銷毀資料。** 開關升級成全域後就是一個權限旗標；把檔案設成唯讀不會刪掉檔案。
- **跨頁誤刪難以察覺。** 舊行為掃的是整份 `selected`。全域化後，使用者在 B 頁隨手關掉開關，會靜默清掉他在 A 頁精選的項目，而且清除發生在他沒在看的頁面。
- **舊行為的保證本來就有破口。** `selected` 持久化、開關不持久化，所以切走再回來時開關顯示 OFF、但選取仍在，清理邏輯根本沒跑過。B2 移除了這個「有時跑有時不跑」的不一致。

反悔路徑改由待下載清單（`SelectedVideos`）逐筆移除——那裡本來就是選取內容的權威檢視。

考慮過的替代方案：
- **B1 維持一關全清** — 語意一致但破壞力隨全域化放大。
- **B3 清但跳 toast** — 仍是靜默刪除的變體，只是事後告知；toast 消失後無法復原。

### D4：`disabled` 與 `checked` 用同一個判定式

六頁統一為：

```
isBlocked(v) := <已下載訊號> && !allowRedownload
  :disabled = isBlocked(v)
  :checked  = isSelected(v.video_id) || isBlocked(v)
```

`<已下載訊號>` 在最新影片頁是 `isDownloaded(id) || v.downloaded_on_disk === true`，其餘五頁是 `isDownloaded(id)`。

把兩個屬性綁在同一個布林上，可確保「停用時顯示為完成勾」與「可操作時顯示真實選取狀態」兩種呈現不會脫節。這不是美化——`:checked` 若漏改，開關在那五頁等於沒有作用（見 Context 第 1 點）。

保留「停用時呈現為已勾選」是刻意的：它與「✅ 已下載」徽章一起構成「這件事已完成」的視覺，而非「已加入待下載」。

### D5：header 控制項的視覺重量壓低

放在 quota 徽章旁，沿用最新影片頁 `.redownload-toggle` 既有的小字樣式（`0.78rem`、灰字）。開關 ON 時可加上輕微的強調（例如變色或加框），讓使用者在別頁看到「目前處於解鎖狀態」。

理由：這是低頻但有後果的操作。永遠可見是必要的（它現在是全域狀態），但不該搶走 header 的主視覺。ON 狀態的視覺提示比 OFF 更重要——OFF 是安全預設，ON 才需要被注意到。

### D6：`PAGE_SIZE` 直接改常數，不做成設定

`LatestVideosFeed.vue` 的 `const PAGE_SIZE = 50` 改為 `200`，不引入設定項、不加 UI 下拉。

理由：這是純顯示批次量，與 API 請求無關（後端 `limit = 50` 是「每個訂閱頻道抓 50 部」，兩者無關聯）。訂閱數多時 200 通常一次就涵蓋整批結果，「載入更多」自然退場。做成可設定會與 `UrlDownloadFeed` 已有的「每頁顯示」下拉語意混淆——那個是真分頁器，這個是累加式載入。

## Risks / Trade-offs

- **一次渲染 200 張卡的效能** → 無虛擬捲動，200 個 `<img>` 縮圖會同時進入 DOM。縮圖走 YouTube CDN、受瀏覽器並行連線數自然節流，實測風險低。若後續出現卡頓，可在不改 spec 的前提下加上 `loading="lazy"`。
- **全域開關忘了關** → 開關不持久化（D2），重新整理即回到 OFF；ON 狀態在 header 有視覺提示（D5）。剩餘風險是同一個 session 內長時間忘記，此時 `selected` 內容仍需使用者主動送出下載才會生效，不會自動觸發。
- **B2 廢除既有需求** → 舊行為的使用者若習慣「關開關 = 清乾淨」，會發現項目仍在。屬刻意變更，已在 `specs/latest-videos-feed/spec.md` 的 REMOVED 段落記錄 Reason 與 Migration。
- **六個元件重複同一段判定式** → 本次不抽共用 composable，維持各元件內聯，與現有 codebase 風格一致（各 feed 元件本來就各自持有相似的 template）。若日後新增第七個清單頁，再評估抽出 `useDownloadGate()`。
- **`downloaded_on_disk` 的標題碰撞誤判** → 既有問題（同名影片會被誤標）。全域開關讓誤判在任何頁面都能繞過，實際上是改善而非新增風險。

## Migration Plan

純前端變更，無資料遷移、無後端變更、無 API 契約變動。localStorage 的 `yt_mp3_downloaded_ids` 與 `yt_mp3_selected` 格式皆不變，舊資料直接相容。

回滾即還原前端 commit；因為沒有新增任何持久化狀態，回滾後不會留下孤兒資料。
