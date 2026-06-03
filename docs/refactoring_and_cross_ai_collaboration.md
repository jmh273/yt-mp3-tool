# 重構考量與跨 AI 協作 — 工作流筆記

> 整理日期：2026-06-03
> 延續 [`ai_code_editing_qa.md`](ai_code_editing_qa.md)（Q1–Q9）。本文聚焦兩個更精煉的**判斷框架**：
> 1. 該不該重構 —— 以「**AI 編輯成本**」而非「人類導航舒適度」為目標函數
> 2. 跨 AI 協作 —— Claude 出規格 → Codex 實作 → Claude 驗證，這套流程到底有沒有省 token

---

# Part 1 — 程式重構的考量（以 AI 編輯為目標函數）

## 1.1 先換掉目標函數

舊問題：「main.py 2962 行會不會太長、要不要拆？」
這是**人類**的問題 —— 人類滾大檔很煩、PR 難 review。

但**現在是 AI 在改這份程式**。所以正確的問題是：

> **什麼結構讓 AI（或其它 AI）改得準、改得安全，而且最省使用者的 token？**

這是不同的目標函數。針對它最佳化，答案跟「人類舒適度」常常**不一致**，甚至相反。

## 1.2 AI 編輯的真實 token 成本模型

AI **幾乎不會整檔讀**。一次編輯的成本大致是：

```
單次編輯 token ≈
    定位 (grep)            ← 便宜，且與總行數無關（看 greppable 程度）
  + 讀相關段落            ← ∝ 該「領域段落」大小，不是整檔大小（用 offset/limit 讀）
  + 載入「安全編輯」上下文  ← ∝ 共用可變狀態的擴散程度   ★真正的稅
  + 改 (Edit)            ← 便宜
  + 讀測試輸出            ← ~固定
```

量級感（本專案實測級別）：

| 動作 | token |
|---|---|
| 整檔讀 main.py（2962 行） | **~33k** ← 極少這樣做 |
| 典型一次改：grep + 讀一段 ~120 行 + Edit + 測試輸出 | **~4–6k**，**與總行數無關** |

**重點：行數本身不太花 token，因為我按段落讀。** 真正花 token 的是另外兩件事（見 1.4）。

## 1.3 三個反直覺結論

1. **單一、greppable、分區清楚的檔案，對 AI 是友善的。** 一個 grep 掃完全檔、編輯就地、不必維護跨檔接口。「3000 行 = 壞」是人類導航直覺，不是 AI 的約束。

2. **拆成很多小檔，對 AI 可能更貴、不是更省。** 因為會引入：
   - 跨檔追資料流：`開 A → 見它 import B → 開 B → ...` 的多輪 round-trip
   - `__all__` / import 接線維護
   - **mock 目標位移**（見 1.4）

3. **真正的成本驅動是隱性耦合，不是行數。** 要「安全地」改一段，我得先確認它不會牽動別處。這個不確定性稅 ∝ 共用狀態擴散，與檔案大小無關。

## 1.4 真正的稅：本專案的兩個隱性耦合

| 耦合 | 本專案實況 | 對 AI 的代價 |
|---|---|---|
| **全域可變狀態** | `download_progress` / `normalize_progress` / `drive_upload_progress` 3 個 dict + locks，跨 **22 處**被讀寫 | 每次改 download/normalize/drive，都要先確認「這 dict 有沒有被別領域偷動」→ spooky-action 稅 |
| **mock surface = 符號表** | 213 個測試全 `import main` + 大量 `patch("main.build")`（46 次）、`patch("main.load_credentials")` 等 | **把符號搬到子模組，`patch("main.X")` 就會 patch 不到**（「patch 在查找處」原則）→ 搬一個函式 = 改一票測試 |

第二點最關鍵：**測試的 mock 目標就是 `main` 的 import surface。** 這代表「保持符號穩定」比「減少檔案行數」對 AI 更有價值 —— 直接反對「為了行數而拆」。

> 實例：discovery 區塊看似可獨立抽出，但它直接呼叫 `build("youtube"...)` 數次，而 `build` 被 `patch("main.build")` 用了 46 次 → 整塊搬走會打爛大量 mock。真正乾淨的 leaf 反而是 **mp3gain 正規化引擎**（subprocess，不碰 build/credentials）。

## 1.5 對「main.py 該不該拆」的**更新結論**（修訂舊 Q9）

舊 [Q9](ai_code_editing_qa.md) 設了回頭重審的觸發條件：**「main.py ≥ 2200 行」**。現在是 **2962 行，已觸發**。重審後，用新 lens 的結論是：

> **不要為了行數重構。** 現在的形狀已接近「AI 最優」：分區清楚、命名可預測（`run_X_batch` / `_resolve_X_concurrency`）、測試快又綠。為了「2962」這個數字拆檔，**淨效應是讓使用者更花 token**（AI 多付跨檔追蹤 + mock 改寫），不是更省。

舊 Q7/Q9 對模組化偏樂觀（估 -5~10% token），是因為**低估了兩個因素**：
- `patch("main.X")` 的 mock 位移成本
- 全域可變狀態的擴散，讓「安全編輯上下文」不會因拆檔而變小

唯一**真正會降低未來 token** 的小動作，不是拆大檔，而是：

> **把 3 個全域 progress dict + locks 集中進一個小 `state` 模組**（全員 import）。
> 消掉「這 dict 是不是被別處共用」的不確定性稅；re-export 後 `main.download_progress` 等 18 處測試引用照樣有效，**不動 mock surface**。

## 1.6 決策光譜與檢查清單

```
不動            集中全域 state      抽純 leaf 引擎       全面拆檔
(0 風險)        (低，真正省稅)      (mp3gain 才乾淨)     (高風險，AI 更貴)
  └─ 預設 ───────┴── 想要小贏到這 ──┘                    └─ 別 ─┘
```

**何時才真的該拆某塊出去**（任一成立才考慮，且只抽那一塊）：
- [ ] 那塊是**測試不 mock** 的純 leaf（搬走不會破 `patch("main.X")`）
- [ ] 它**不碰**三個全域 progress dict
- [ ] 它**不呼叫**被 patch 的依賴（`build` / `load_credentials` / `load_settings`…）
- [ ] 有**功能變更**順帶觸發（co-located 在那次 change 的 commit，tests 同一波驗）

> 一句話：**檔案大小是人類的焦慮；AI 的焦慮是隱性耦合。把 state 收乾淨 > 把檔案切碎。**

---

# Part 2 — 跨 AI 協作（Claude 出規格 → Codex 實作 → Claude 驗證）

## 2.1 兩種模式

```
模式 A（分工）：  探索 ─→ 寫規格 + CODEX-BRIEF ─→ [Codex 實作] ─→ Claude 冷讀 diff 驗證
                  │         │ Claude 帳           │ 不在 Claude 帳!  │ Claude 帳（偏貴）

模式 B（自寫）：  探索 ─→ (規格) ─→ Claude 自己 Edit + 反覆 debug ─→ Claude 驗證
                  │       │ Claude 帳  │ Claude 帳（實作 churn 全進來）  │ Claude 帳
```

**關鍵前提：「token」要分清楚是哪條帳。** 使用者問的通常是「**Claude 這條帳**」（付給 Claude 的）。Codex 的算力是**另一條帳**。這個區分是整個分析的核心。

## 2.2 token 落在哪：兩模式的差異

共用成本（兩邊都付）：**探索、寫規格、跑測試 / e2e**。
差異只在**中間那段**：

| 環節 | 模式 A 多付 | 模式 B 多付 |
|---|---|---|
| 寫 CODEX-BRIEF | ✓ 把實作講到 Codex 不會錯 ≈ 把實作「用散文寫一遍」 | — |
| 冷讀 diff 驗證 | ✓ 讀**陌生**改動、反推意圖 | 自己寫的不必冷讀，本來就在腦裡 |
| 實作 churn | — | ✓ Edit 的 exact-match 反覆、跑測試、修自己的錯 |

實作的 token 大多**死在「髒中段」**（改錯重來、測試紅了修、re-read 檔案）。模式 A 的本質就是**把這段髒中段移到 Codex 的帳上**。

## 2.3 成本不等式（看改動大小，會變號）

```
模式 A 省 Claude 帳  ⟺  cost(寫 brief) + cost(冷讀 diff 溢價)  <  cost(自己實作 + 反覆 iteration)
```

| 改動性質 | 右邊（自寫成本） | 結論 |
|---|---|---|
| **小而乾淨** | 很小（沒什麼 debug churn） | A 的 brief + 冷讀**反而比自己寫貴** |
| **大而髒**（多檔、框架摩擦、多輪 debug） | 爆炸 | churn 全被 Codex 吃 → A **大省** |

**實測對照（本次兩個小功能：日期 rollover + Drive 並行）** —— 都是小而乾淨：

- 模式 A 我付：兩份 brief ~5k + 冷讀 diff / 抓亂碼 / 確認 selector ~4–6k ≈ **9–11k**
- 模式 B 我付：自己實作 + iteration ~8–15k
- → **這次 A 並沒有明顯省 raw token，大概打平甚至略貴。**

## 2.4 兩個被忽略、但真正划算的點

即使 raw token 打平，模式 A 仍常常值得，因為：

1. **帳轉移**：實作 churn 進了 Codex 的帳。即使總工作量一樣，**付給 Claude 的那條帳變少**。若 Codex 是另一個計費池 / 較便宜，這是淨賺 —— 跟「raw token 有沒有少」是兩回事。

2. **Claude 的 context 保持乾淨（會複利）**：自己實作時 context 被檔案讀取、Edit 結果、測試輸出、debug 輪迴塞爆 → **之後每個 turn 都變貴**，還可能觸發 compaction（本身又花錢）。模式 A 把那堆髒東西留在 Codex 的 context，Claude 這邊精簡 → **這一題之後的整場對話都更便宜**。單看「一題 token」會漏掉這個長尾收益。

## 2.5 風險：模式 A 的成本變異大

如果 **brief 講不夠精確**，Codex 可能產出**微妙的邏輯錯**（不是亂碼那種一眼可見的）。這時冷讀 diff 要花更多 token 才抓得到，還要來回修 → A **反而比自己寫更貴**。

→ 模式 A 的成本**變異大**：brief 寫得好就賺，寫不好就賠。降低變異的方法 = brief 寫得自足、精確（見 2.6）。

## 2.6 CODEX-BRIEF 撰寫要點（從實戰萃取）

讓 Codex「不會走偏」、把 A 的變異壓低的關鍵：

- **自足**：含精確行號、要照抄的既有樣式連結、要點與**禁區**，Codex 不必再翻 spec 也能做。
- **標紅地雷**：把容易踩的陷阱明確標出（例：Drive 上傳的 Google client **非 thread-safe**，每檔各建自己的 service）。
- **比照既有慣例**：明講「完全比照 `download_concurrency` 的處理方式」「不進 `_SETTINGS_RANGES`」，避免 Codex 自由發揮。
- **劃清不要碰**：列出不可動的既有行為 / 端點 / 邏輯。
- **驗收分工**：brief 明寫「**不要 archive、不要寫 / 跑 e2e**」—— e2e verify 與 archive 由 Claude（審查者）負責，對齊本專案慣例。

## 2.7 決策法則

```
改動小 / 很懂 / 一次能寫對      → 自己寫 (B)。brief + 冷讀的固定成本不值得
改動大 / 髒 / 要多輪 debug       → 出規格給 Codex (A)。churn offload + context 保乾淨，大賺
想要 OpenSpec 紀錄             → 規格照寫（兩模式都要），只差實作誰來
想壓低「Claude 這條帳」而非總量  → 永遠 A（把實作轉到 Codex 帳）
brief 沒把握寫精確            → 傾向 B（避免 A 的反噬變異）
```

> 一句話：**模式 A 不保證減少 raw token —— 小改動它甚至略貴。它真正做的是「把實作 churn 移出 Claude 的帳、移出 Claude 的 context」。改動越大越髒，這筆交易越划算；小而乾淨時，自己寫反而省。**

---

## 附：兩個 Part 的共同底層觀念

兩個主題其實是同一個洞見的兩面：

> **以「AI 實際怎麼工作 + token 落在哪條帳」為目標函數做決策，而不是套用人類工程直覺。**

- 重構：人類看「行數」，AI 該看「耦合」。
- 分工：人類看「總工作量」，AI 該看「哪條帳付 churn + context 乾不乾淨」。
