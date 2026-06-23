## Context

下載的「目標資料夾」與「流水號計算」目前由三個彼此獨立的點決定，沒有單一事實來源：

```
前端 targetDirPath（mount 時算一次、可手動編輯、不持久化）
   │  onDownload 送 target_dir = basename(targetDirPath)
   ▼
後端 run_download → _scan_next_seq(實際 output_path)   ← 掃對資料夾（但僅在 start_seq=None 時用）
                  → _compute_seq_prefix(start_seq, …)   ← 有 start_seq 就照單全收，不掃

前端 startSeqInput ← GET /download/next-seq → _today_download_dir()  ← 永遠掃「當日」資料夾 ✗
```

`start_seq` 幾乎總是被送出（next-seq 預填非空），所以實際生效的是「對著當日資料夾算出來的起始號」，套到任何目標資料夾上。這就是重複/跳號與跨午夜寫錯資料夾的根因。

## Goals / Non-Goals

**Goals**
- 「掃描流水號的資料夾」恆等於「實際下載的資料夾」（解 C1、C2，消除重複/跳號）。
- App 久開跨午夜時，未經編輯的預設資料夾自動翻新到今天（解 A，消除寫進昨天）。

**Non-Goals**
- 不改 `run_download` 內部既有序號演算法（idx-based、`_compute_seq_prefix` 行為不變）。
- 不改 Drive 上傳面板預設（見 proposal Out of Scope，非缺陷）。
- 不做批次送出後的中途目錄切換。

## Decisions

### D1：`/download/next-seq` 接受目標資料夾參數，沿用 `download` 的解析
- **選擇**：端點新增 query 參數（如 `?dir=<name>`）。後端以與 `POST /download` **相同**的 `_resolve_output_child(output_path, dir)` 解析（含 `..`／絕對路徑越界防護、空值回退當日），再 `_scan_existing_seqs` 掃該資料夾。未帶參數時行為等同現況（掃當日），維持向後相容。
- **理由**：復用既有解析確保「next-seq 掃的目錄」與「download 寫的目錄」用同一套規則，不會再次脫鉤。
- **取捨**：新增一個參數，舊客戶端不帶仍可運作。

### D2：前端在 `targetDirPath` 變動時重抓 next-seq，並於送出時帶目標目錄
- **選擇**：新增 `watch(() => download.targetDirPath, …)` 觸發 `fetchNextSeq(basename(targetDirPath))`（建議 debounce 避免逐字觸發）；現有 mount / 選取 / 下載完成的觸發點也改帶目標目錄。
- **理由**：改資料夾後起始號、衝突警告立即對齊正確資料夾。
- **取捨**：text input 逐字輸入需 debounce（如 300ms）以免頻繁打 API。

### D3：A 的翻新只作用於「未編輯的預設值」，用 dirty 旗標區分
- **選擇**：新增旗標標記使用者是否手動改過「下載到」欄。翻新（rollover 到今天）在以下時機對**仍為自動預設**的值套用：分頁 keep-alive 重新 `onActivated`、下載完成後、送出下載前。使用者一旦手動編輯，旗標轉 dirty → 後續不自動翻新，保留其刻意指定（含刻意指定為昨天日期的情況）。
- **理由**：直接在送出時無條件 rollover 會覆寫使用者刻意選的資料夾（例如想補檔到昨天那批），是不可接受的副作用。dirty 旗標精準區分「凍結的陳舊預設」與「使用者的選擇」。
- **取捨**：需引入並維護 dirty 狀態；mount 自動填入時設為非 dirty，input 事件設為 dirty，「清除/重置」回非 dirty。

### D4：不持久化 `targetDirPath`／不改其 ref 預設
- **選擇**：維持 `targetDirPath` 為 session 內狀態（不持久化）。A 的問題只發生在「久開跨午夜」，靠 D3 的重新翻新時機解決，毋須持久化。
- **理由**：避免把跨重整的目錄記憶引進來（那是另一個語意問題）。

## Risks / Trade-offs

- **R1（D3 dirty 判定邊界）**：若使用者把欄位改成與當日預設「剛好相同」的字串，會被視為 dirty 而不再翻新——影響極小（值本就已是今天）。
- **R2（debounce 競態）**：快速改目錄又馬上按下載，可能在 next-seq 回來前送出。緩解：送出前直接以目標目錄同步取一次，或後端在 `start_seq=None` 時本就會掃實際資料夾兜底（見 D5）。
- **R3**：next-seq 與實際 download 之間仍有 TOCTOU 視窗（兩次呼叫間資料夾被改動）。屬既有限制，後端 `yt-dlp` 去重（`-2`/`-3`）兜底，不在本 change 處理。

### D5：後端兜底（建議但非必須）
- 前端在 `seq_enabled` 且**起始號為空**時本就只送 `seq_enabled: true` 不送 `start_seq`，後端會 `_scan_next_seq(實際目錄)` 自動續編——這條路徑天生正確。可考慮讓前端在「目標目錄 ≠ 當日」時優先走此兜底，降低對 next-seq 預填正確性的依賴。設計上列為可選強化，主修仍以 C1+C2 為準。

## Migration / Verification

- 無資料遷移。`/download/next-seq` 加可選參數，向後相容。
- 驗證 `frontend/e2e/verify-fix-seq-target-dir-mismatch.ts`（驗證者撰寫並執行）覆蓋：
  1. 改自訂資料夾 → 連續下載兩批 → 第二批序號接續、**不重複**；
  2. 模擬跨午夜（mock 系統時間）→ 未編輯的預設翻新到今天、下載寫進今天資料夾；
  3. 使用者手動指定昨天日期資料夾 → 送出時**不被**自動翻新覆寫。
- 後端單元測試：`/download/next-seq?dir=<custom>` 掃對資料夾、越界 `dir` 被拒、未帶參數回退當日。
