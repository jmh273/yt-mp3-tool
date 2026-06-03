# AI 如何修改程式碼 — Q&A 整理

> 整理日期：2026-05-19

---

## Q1：AI 修改程式時，如果只是要變動一個小功能，需要整個程式全部重新輸出嗎？

**不需要！** AI 有精準的局部編輯工具，只會修改需要變動的那幾行，不會重寫整個檔案。

### 編輯方式一覽

| 情境 | 使用的工具 | 做法 |
|---|---|---|
| 改一小段程式碼 | `replace_file_content` | 指定「原本的內容」→「替換成的內容」，只動那幾行 |
| 同一檔案改多處不相鄰的地方 | `multi_replace_file_content` | 一次送出多個替換區塊，每個區塊各自精準替換 |
| 全新檔案 | `write_to_file` | 這時才會輸出整份內容 |

### 實際例子

比如要把 header 的字體從 `1.4rem` 改成 `1.2rem`，AI 只會做這樣的事：

```diff
-h1 { margin: 0; font-size: 1.4rem; }
+h1 { margin: 0; font-size: 1.2rem; }
```

而不是把整個 `HomeView.vue` 兩百多行全部重新輸出。

### 為什麼這很重要

1. **不會誤傷無關的程式碼** — 只動該動的地方，其餘完全不碰
2. **速度快** — 不需要重新生成幾百行沒變動的內容
3. **容易追蹤變更** — 每次編輯都會顯示 diff，能清楚看到改了什麼

---

## Q2：AI 如何知道要改哪裡？

AI 不會憑空猜測，而是會先用工具去查看現有程式碼。

### 步驟一：先「讀」再「改」

| 步驟 | 使用的工具 | 目的 |
|---|---|---|
| 瀏覽專案結構 | `list_dir` | 知道有哪些檔案、目錄怎麼組織的 |
| 閱讀檔案內容 | `view_file` | 看懂現有的程式碼邏輯 |
| 搜尋關鍵字 | `grep_search` | 快速定位某個函式、變數、CSS class 在哪裡被使用 |

### 步驟二：推理定位

舉個具體例子 — 假設需求是「把影片縮圖變小一半」：

```
1. 縮圖 → 搜尋 "thumbnail" 或 "thumb" → 找到 ChannelVideos.vue
2. 打開檔案 → 讀 CSS → 發現 .thumb-wrapper { width: 100% }
3. 判斷：把 width 改成 140px 就好
4. 只替換那一段 CSS
```

### 步驟三：參考上下文線索

- **使用者正在開啟的檔案** — 系統會告訴 AI 目前在看哪個檔案、游標在第幾行
- **對話歷史** — 之前討論過的架構和設計決定都會記得
- **專案的設計文件** — 像專案裡的 `openspec/` 資料夾，AI 會去讀取參考

### 不確定的時候？

- **先搜尋再確認**，而不是盲目修改
- **詢問使用者**，而不是自己猜

> 簡單來說：AI 是先讀懂程式碼，才動手修改的，跟一個真人工程師接手別人的專案時做的事情是一樣的。

---

## Q3：對話內容想整理成文件，怎麼做才方便？

### 方案一：直接請 AI 整理（最方便）

每次對話結束、或隨時，跟 AI 說：「幫我把這次對話整理成文件」

AI 可以產出：
- **Markdown 文件**（`.md`）— 放在專案裡方便查閱
- **Word 文件**（`.docx`）— 適合分享給別人或正式留存

### 方案二：指定整理範圍與格式

| 類型 | 適合情境 | 範例 |
|---|---|---|
| **開發日誌** | 記錄每次做了什麼改動 | 日期 + 修改摘要 + 異動檔案 |
| **技術筆記** | 記錄架構決策和原理 | 為什麼選三欄式佈局、API 設計考量 |
| **Q&A 整理** | 像這樣的知識性問答 | 問題 + 回答，方便日後查閱 |
| **變更紀錄** | 類似 CHANGELOG | 版本 + 功能清單 + diff 摘要 |

### 方案三：持續維護的開發筆記

可以在專案裡建一個文件（例如 `docs/dev-notes.md`），每次做完一個功能就追加記錄，這樣就不用每次額外整理。

---

## Q4：只改部分程式碼，會不會很容易改錯？

其實有多層防護機制在確保不會改錯：

### 第一層：工具本身的安全機制

編輯工具要求 AI 提供「要被替換的原始內容」，系統會去檔案裡比對：

```
AI 說：把 "font-size: 1.4rem" 改成 "font-size: 1.2rem"
系統會：去檔案裡找 "font-size: 1.4rem" 這段文字
```

| 比對結果 | 系統行為 |
|---|---|
| ✅ 找到**剛好一處**符合 | 執行替換 |
| ❌ **找不到**（內容不匹配） | **拒絕執行**，回報錯誤 |
| ❌ 找到**多處**相同的文字 | **拒絕執行**，要求指定更精確的範圍 |

所以如果 AI 記錯了原本的程式碼長什麼樣，**工具會直接擋下來**，不會硬改。

### 第二層：先讀再改

AI 不會靠「記憶」去改程式，而是每次都會：

```
1. view_file → 讀取檔案最新內容
2. 確認要改的那段程式碼確實存在
3. 才送出編輯指令
```

### 第三層：每次修改都會顯示 diff

每次改完，系統會自動產出差異對照：

```diff
-h1 { margin: 0; font-size: 1.4rem; }
+h1 { margin: 0; font-size: 1.2rem; }
```

使用者可以立刻看到改了什麼，如果不對可以馬上要求改回來。

### 第四層：版本控制 (Git)

專案有 Git 的話，所有變更都可以 `git diff` 檢查或 `git checkout` 還原。

> **真正容易出錯的反而是「全部重寫」** — 可能不小心漏掉某段原有程式碼、改到不該改的地方、或差異太多難以看出到底改了什麼。所以局部編輯其實比全部重寫**更安全**。

---

## Q5：如果有個程式行數很多，是否每次修改都會讀一遍，使用很多 input token？

### 是的，大檔案會消耗較多 token

每次用 `view_file` 讀取檔案內容，那些內容就會計入 input token。一個 500 行的檔案大概就是 **2000~4000 tokens**。

### 但有幾個策略來減少消耗

#### 1. 只讀需要的範圍

`view_file` 可以指定行數範圍，不需要每次讀完整個檔案：

```
# 讀整個檔案（第一次需要了解全貌）
view_file("main.py")

# 之後只讀需要改的區塊
view_file("main.py", StartLine=80, EndLine=120)  ← 只讀 40 行
```

#### 2. 用搜尋代替閱讀

如果只需要知道某個函式在第幾行，用 `grep_search` 比讀整個檔案便宜很多：

```
grep_search("def enhance_and_filter_videos")  ← 只回傳匹配的那幾行
```

#### 3. 同一輪對話中有記憶

在同一次對話裡，如果 AI **剛讀過**某個檔案，短期內再改同個檔案時，已經知道它的結構了，不一定需要再讀一次。

### 實際的 token 消耗模式

| 情境 | token 消耗 |
|---|---|
| 第一次接觸一個檔案 | 較高（需要讀完整檔案了解結構） |
| 同次對話中再次修改同檔案 | 較低（可能只讀局部或不需再讀） |
| 用搜尋定位 | 很低（只回傳匹配行） |

### 實際建議

> **把大檔案拆小** — 例如 `main.py`（551 行）可以拆成 `auth.py`、`subscriptions.py`、`download.py` 等模組，每個 100~200 行。這樣不管是人還是 AI 維護都更輕鬆。

---

## Q6：當檔案拆分後，AI 怎麼知道要讀哪一部分的程式碼？

靠的是一套**由粗到細**的搜尋策略：

### 第一步：看目錄結構（最便宜）

```
list_dir("backend")

→ auth.py
→ subscriptions.py
→ download.py
→ settings.py
→ utils.py
```

光看**檔名**就能判斷大概要改哪個。比如說「下載功能有 bug」，自然會先去看 `download.py`。

### 第二步：搜尋關鍵字（很便宜）

如果檔名不夠明確，用搜尋：

```
grep_search("enhance_and_filter_videos", "backend")

→ 結果：subscriptions.py 第 45 行
```

這只會回傳**匹配的那一行**，不會讀整個檔案，token 消耗非常小。

### 第三步：只讀相關檔案（精準）

確定是哪個檔案後，才用 `view_file` 去讀它。

### 整個流程的 token 消耗對比

假設後端有 5 個檔案、各 100 行：

| 做法 | 需要讀的量 |
|---|---|
| ❌ 一個大檔 500 行，每次全讀 | **500 行** |
| ✅ 拆成 5 個，先搜尋再讀目標檔案 | 目錄結構 + 搜尋結果 + **100 行** ≈ **110 行** |

### 好的拆分本身就是「導航地圖」

就像一棟大樓，如果所有功能都擠在一間房間裡，找東西很慢。但如果分成：

```
backend/
├── routes/
│   ├── auth.py          ← 登入相關？來這裡
│   ├── subscriptions.py ← 訂閱相關？來這裡
│   └── download.py      ← 下載相關？來這裡
├── services/
│   └── youtube.py       ← YouTube API 邏輯？來這裡
└── utils.py             ← 工具函式？來這裡
```

**檔案結構本身就告訴 AI 該去哪裡找**，人類工程師也是這樣組織程式碼的。

### 補充：import 也是線索

即使判斷錯了，打開檔案後看到頂部的 import：

```python
from services.youtube import enhance_and_filter_videos
```

就知道要跳去 `services/youtube.py` 繼續追蹤，跟人類 trace code 的方式一模一樣。

> **結論：拆分後不但不會找不到，反而因為結構清晰更容易找到，而且讀更少、花更少 token。**

---

## Q7：AI 找要改的地方時，只讀程式碼嗎？還是也讀規格 / 設計文件？

> 新增於 2026-05-21

**兩者都讀，而且規格通常讀得比程式碼更多。** 這個事實會徹底改變「拆模組會不會更耗 token」的計算結果。

### 拿一次真實的 change 來算

以剛完成的 `configurable-sequence-prefix` 為例（加流水號 + 自訂起始號的功能），AI 在這個 change 期間實際讀了什麼：

| 類別 | 檔案 | 約略 tokens | 占比 |
|---|---|---:|---:|
| **SPEC** | `openspec/specs/download-filename-prefix/spec.md` | ~1100 | |
| **ACTIVE** | 該 change 的 proposal / design / specs delta / tasks | ~3200 | |
| **CODE (back)** | `backend/main.py` 對應段（grep + 窗口讀） | ~1500 | |
| **CODE (front)** | `SelectedVideos.vue` + `download.ts` | ~1500 | |
| **TESTS** | `test_download.py` + `stores.test.ts` | ~1200 | |
| **E2E** | `verify-helpers.ts` + 新寫的 `verify-<name>.ts` | ~600 | |
| | **合計** | **~9100** | |

**程式碼只佔 33%。** OpenSpec 規格 + change 工作底稿合計 47%，tests + e2e 19%。

### 為什麼這對「模組化 token 帳本」很重要

之前討論過「main.py 1696 行拆掉，AI 找東西會不會變難 / 變貴」。如果只看 code reads，模組化每次第一輪會多讀 30~40% — 因為小檔我傾向整檔讀，大檔則 grep 後窗口讀。

但 code 只佔 33% 的話：

```
總用量影響 = 33% × (1 + 0.4) + 67% × 1.0 ≈ 1.13×
```

模組化全局只貴 ~13%，**還沒算 spec → 模組對應帶來的反向節省**。

### Spec 名稱 = 資料夾名稱 的乘數效應

OpenSpec 規格的命名跟想像中的模組化資料夾天生對齊：

| spec 名稱 | 模組化後該去哪 |
|---|---|
| `download-filename-prefix` | `backend/download/seq.py` + `ytdlp.py` |
| `download-format-quality` | `backend/download/seq.py` |
| `latest-videos-feed` | `backend/feeds/latest.py` |
| `trending-videos-feed` | `backend/feeds/trending.py` |
| `url-download-preview` | `backend/feeds/url_preview.py` |
| `local-quota-counter` | `backend/shared/quota.py` |

讀完 spec，下一步直接 `view_file` 對應檔，**省掉一輪在 1696 行 main.py 裡 grep 找位置**。這個流程改動讓模組化在第二個 change 起反而比現狀更省 token。

### 修正後的綜合表

| 設定 | 對「總 token 用量」影響 | 對「找對檔信心度」影響 |
|---|---|---|
| 單檔現況 | baseline | 中 — grep 雜訊 + 窗口判斷 |
| 模組化（無導覽文件） | +10~15% | 差 — 容易找錯資料夾 |
| 模組化 + spec/folder 同名 | -5~10% | 好 — spec 就是 GPS |
| 模組化 + 導覽文件 (CLAUDE.md / docs/backend-layout.md) | -10~15% | 最好 — 預載入記憶 |

> **重點**：判斷「拆不拆」時，不要只算 code reads。把 spec、tests、e2e 一起算，模組化只要配合「spec/folder 同名」和「導覽文件」兩個小投資，**整體會比現在更省 token，也更不容易出錯**。

---

## Q8：程式碼模組化時，spec / design md 也要跟著更新嗎？

> 新增於 2026-05-21

**主規格（`openspec/specs/<capability>/spec.md`）幾乎不用動；歸檔的 change md 不能動；但模組化重構本身應該是個新的 OpenSpec change，會產生新的 design.md 描述新 layout。**

### 規格寫的是「行為」不是「位置」

把專案 10 個主規格全文 grep，**0 個** 提到 `backend/main.py`，**0 個** 寫死後端檔案路徑：

```
$ grep -rn "main\.py\|backend/.*\.py" openspec/specs/
（無結果）
```

唯一出現檔案路徑的是 [openspec/specs/playwright-feature-walkthrough/spec.md](../openspec/specs/playwright-feature-walkthrough/spec.md):112-113，敘述 npm scripts 跑哪個 `frontend/e2e/*.ts` — 那是 e2e 工具鏈契約的一部分，跟後端拆不拆無關。

所以**後端怎麼拆，主規格都不用改**。`POST /download` 回 `task_id` 這個行為承諾不會因為 handler 從 `main.py:1342` 搬到 `download/routes.py:42` 而失效。

### 歸檔過的 change md 是歷史，不能動

```
openspec/changes/archive/2026-05-21-configurable-sequence-prefix/design.md
```

裡面寫的 `backend/main.py:1086`、`backend/main.py:1192-1195` 都是**歸檔當下的事實**，是給未來想了解「這個 change 怎麼做的」的人看的歷史紀錄。模組化後雖然行號失效，但**不能去改**，否則就破壞「change = 該時間點的決策快照」這個契約。要看當下程式碼長什麼樣，看 `git log` / `git blame` 對應 commit；要看歷史決策，看歸檔。

### 重構本身應該是一個 OpenSpec change

```
openspec/changes/refactor-modularize-backend/
├── proposal.md   ← 為什麼要拆、要解決什麼問題
├── design.md     ← 新 layout 長什麼樣、邊界怎麼切、import 流向
└── tasks.md      ← 一檔一檔搬，配 git move + tests 通過驗收
```

**注意：沒有 `specs/` 子資料夾（沒有 spec deltas）**，因為行為不變。這是 OpenSpec 對「純重構」型 change 的正確姿態。

### 同時應該新增（不是修正）一份導覽文件

模組化本身只搬程式，**真正讓未來人類和 AI 受益的關鍵**，是再加一份新文件當地圖：

| 候選位置 | 內容 |
|---|---|
| `docs/backend-layout.md` | `backend/<folder>/` 每個資料夾職責、彼此 import 關係 |
| 專案根 `CLAUDE.md` | 5~10 行精簡導覽，AI 每次對話自動載入 |

兩者選一即可。後者對 AI 工作更直接，前者對人類 onboarding 更友善——也可以兩個都做，內容指向彼此。

### 整理

| 文件類別 | 模組化時要做什麼 |
|---|---|
| `openspec/specs/<capability>/spec.md` | **不動**（行為沒變） |
| `openspec/changes/archive/.../*.md` | **不動**（歷史快照不可變） |
| 模組化重構本身的 change md | **新增**（proposal + design + tasks，無 spec delta） |
| `docs/backend-layout.md` / `CLAUDE.md` | **新增**（給未來人 + AI 的導覽） |
| 後端 unit tests 的 `import main` | **要改**（搬 module 時順手調 import path） |
| `backend/build/*.spec`（PyInstaller） | **可能要改**（如果 spec 直接指向 main.py 以外的檔） |

> **結論：模組化是程式碼工程動作，spec 是「我們承諾系統做什麼」的契約。前者不該動到後者。但「我們決定怎麼組織程式碼」這件事本身值得一份新的 design.md + 一份永久的導覽文件，這兩個是模組化 change 的正式產出。**

---

## Q9：那 `backend/main.py` 到底該不該現在拆成模組？

> 新增於 2026-05-21

**結論先講：分析過後傾向「不是現在」。最划算的姿勢是讓它「下次同領域有功能改動時順手漂出去」。如果一定要主動推一個示範，從 `normalize/` 開始最安全。**

### 現況數據

`backend/main.py`：**1696 行 / 64 KB**。Python web 後端的「太大」門檻沒有絕對標準，常見經驗值：

- < 500 行：放心
- 500–1000 行：開始有味道
- 1000–2000 行：明顯該規劃了
- > 2000 行：高風險，不拆容易出事

所以現在在「該規劃」區段，但還沒到「不得不」。

### 5 個判斷訊號（不是只看行數）

| 訊號 | 觀察 | 評估 |
|---|---|---|
| **行數** | 1696 | 進入「該規劃」區段 |
| **凝聚力** | 8–10 個明顯不同主題擠同檔（auth / 訂閱 / 下載 / 正規化…） | 低 |
| **測試組織** | tests 已分 6 檔（`test_download` / `test_normalize` / `test_settings` / `test_subscriptions` / `test_trending` / `test_latest_videos`） | tests 比實作整潔，明顯不對稱 |
| **in-function import** | `import locale` (line 157)、`import threading` (line 305)、`import re` 在多個函式內出現 | 弱訊號：作者覺得「跳回最上面太遠」 |
| **變更頻率衝突** | 最近 3 個 change 都動到 main.py 不同段 | 中：動線變長，但還沒到 merge conflict |

**綜合：明顯應該拆，但不是火燒屁股。**

### 區塊分布

依現有 `# ── 〇〇 ──` 區塊頭統計：

```
section                         lines    %
─────────────────────────────────────────────
imports                          1–22     1%
bundle / dev path resolution     24–67    3%
路徑 + version + lifespan + app  70–146   4%
全域狀態 dict                   148–155   <1%
工具函式                         156–319  10%
多帳號 token + credentials       321–435  7%
Auth 路由                        438–564  7%
訂閱 / 頻道 / 分頁路由           566–816  15%  ← 大塊
設定路由                         818–856  2%
發燒影片路由                     858–943  5%
最新影片路由                     945–1027 5%
搜尋影片路由 (yt-dlp)           1029–1079 3%
網址預覽路由 (yt-dlp)           1081–1137 3%
下載                            1139–1397 15%  ← 大塊
音量正規化                      1399–1651 15%  ← 大塊
version / quota / SPA mount     1652–1696 3%
```

三個 ~250 行的「中型模組」（訂閱、下載、正規化）擠在同一檔。

### 想像中的拆法

```
backend/
├── main.py                    ← FastAPI 建立 / lifespan / include_router / SPA mount  (~120)
├── shared/
│   ├── paths.py               ← _resource_path / _is_frozen / bundled / client_secret  (~80)
│   ├── filenames.py           ← _sanitize_filename / parse_iso_duration / enhance     (~110)
│   ├── settings.py            ← load_settings / save_settings / SettingsUpdate         (~60)
│   ├── quota.py               ← consume_quota / _current_pt_date / GET /quota          (~50)
│   └── state.py               ← download_progress / normalize_progress / 鎖             (~15)
├── auth/
│   ├── credentials.py         ← multi-account token + load_credentials                 (~130)
│   └── routes.py              ← /auth/*                                                 (~130)
├── subscriptions/
│   ├── youtube_api.py         ← fetch_channel_videos_api / uploads-playlist 推斷        (~150)
│   └── routes.py              ← /subscriptions /channels                                (~150)
├── feeds/
│   ├── trending.py            ← /trending-videos + categories                          (~90)
│   ├── latest.py              ← /latest-videos                                          (~85)
│   ├── search.py              ← yt-dlp search + /search-videos                         (~50)
│   └── url_preview.py         ← yt-dlp url-preview + /url-preview + /download/next-seq (~120)
├── download/
│   ├── seq.py                 ← _format_seq / _scan_next_seq / _compute_seq_prefix     (~80)
│   ├── ytdlp.py               ← _build_ydl_opts / run_download                          (~110)
│   └── routes.py              ← POST /download + SSE progress + DownloadRequest         (~80)
└── normalize/
    ├── mp3gain.py             ← analyze / apply / run_normalize_batch / safe rename     (~140)
    └── routes.py              ← /normalize/*                                            (~150)
```

~18 個檔案、每個 50–150 行。資料夾命名跟現有 `openspec/specs/<capability>/` 對齊，做 spec→folder GPS（參見 Q7）。

### 該不該現在動？時機矩陣

| 時機 | 成本 | 收益 |
|---|---|---|
| **現在獨立做** | 高（剛改完 3 個 change、剛建一批 tests、需要逐檔調 import） | 低（沒 user-visible 改變、現況其實還能讀） |
| **下次動同領域時順手拆** | 中（順手把一段拉出去，CO-located 在那次 change 的 PR/commit 裡） | 高（同步驗證新功能 + 重構，tests 是同一波的） |
| **等到沒人改、積壓出問題才大重構** | 低（純整理） | 低（積壓越久 PR 越大、review 越痛） |

### 建議路徑 A（預設）：靠功能變更觸發、逐步漂出去

下次再動 download 區塊（例如要改下載排程、進度回報）時，順手開 `refactor-extract-download-module` 的 change，把 `download/` 那 ~250 行拉成模組。**配著那次功能 commit 一起 review**，比現在獨立開「重構月」風險小很多。

正規化、訂閱、auth 也照同樣節奏，按需要的順序自然 drift 出去。一年內 main.py 會「自己」瘦下來，期間每一步都有 user-facing reason。

### 建議路徑 B（如果心理上想主動推一個示範）：從 `normalize/` 拆

如果**真的想主動動**，最划算的單一切割是 **`normalize/`**：

- 它有 ~253 行很明確的邊界（mp3gain 整套）
- 跟其他 endpoint 共用最少（只有 settings / output_path）
- 動到它的機會最低（不像 download 還在頻繁演化）
- 拉出去可以證明 layout pattern 行不行、tests 怎麼重組

把 normalize/ 當「示範拆法」做一次 single-module extraction，跑完整個流程，再決定要不要把其他塊也照搬。一週內可完成、風險最小、可逆。

### 何時重新檢視這個決定

下列任一條件成立時，就回頭看 Q9：

- main.py 行數 ≥ 2200（再加 ~500 行，等於再吸收 1–2 個新功能）
- 同一個月內 ≥ 2 個 change 在 main.py 同段相鄰處互相干擾
- 出現「在 main.py 某段加新功能時，AI / 人類花太久才找對位置」的具體個案
- tests 已經拆到第 8+ 個檔，但實作仍只有 1 個

> **結論：「可以拆，但不急」。決策不是 yes/no，是時機。預設交給變更節奏自然觸發；若一定要主動推，從 `normalize/` 切一刀做為 layout 試水溫。等到 main.py 突破 2200 行、或有具體痛點個案，就重新走 Q9 流程做一次判斷。**

---

> ⚠️ **2026-06-03 更新：本 Q9 結論已被修訂，請以新文件為準。**
>
> main.py 已達 **2962 行**，越過上面設的「≥ 2200 行重審」觸發條件。重審後，改用「**以 AI 編輯成本為目標函數**」的視角，結論**反轉**為：**不要為了行數拆檔。** 本 Q9（含「從 normalize 拆做示範」的建議）是 1696 行時、偏重「人類導航 / 模組化樂觀估計」的分析，**低估了** `patch("main.X")` 的 mock surface 耦合與全域可變狀態的擴散稅。完整修訂見 👉 [`refactoring_and_cross_ai_collaboration.md` Part 1](refactoring_and_cross_ai_collaboration.md#part-1--程式重構的考量以-ai-編輯為目標函數)。
>
> 一句話差異：舊 Q9 看「行數 → 該規劃拆」；新結論看「耦合 → 別拆，改集中全域 state」。
