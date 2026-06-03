# Codex 實作指示：download-date-prefix-rollover

> 自足實作說明。完成後由審查者對照 `tasks.md` / `specs/` 驗收。所有路徑為 `c:\vue\YT_to_MP3\` 下相對路徑。
> **核心**：啟動帶入「下載到」預設資料夾名稱時,若名稱以 8 碼數字(YYYYMMDD)開頭且**非當日**,把前 8 碼換成當日日期、保留其後字串;無日期前綴則不動。**純前端、單檔小改 + helper + 單元測試**。
> **不要做 e2e**(`frontend/e2e/verify-*.ts`)——審查者負責。

---

## 0. 必讀參考(既有、照抄樣式)

- 既有當日字串產生器:[SelectedVideos.vue:143-149](frontend/src/components/SelectedVideos.vue#L143) 的 `todayYyyymmdd()`(回傳 `YYYYMMDD` 字串,本地時間)。**重用它**。
- 預設值組裝點:[SelectedVideos.vue:176-186](frontend/src/components/SelectedVideos.vue#L176) 的 `loadSettings()`:
  ```ts
  if (!download.targetDirPath) {
    download.targetDirPath = joinPath(outputPath.value, download.lastWorkDirName || todayYyyymmdd())
  }
  ```
- `download.lastWorkDirName` 來源:[download.ts:31](frontend/src/stores/download.ts#L31)(讀 localStorage `yt_mp3_last_work_dir`)。**只讀不改其儲存**。

---

## 1. 新增 helper `rolloverDatePrefix`

**檔案** [SelectedVideos.vue](frontend/src/components/SelectedVideos.vue),放在 `todayYyyymmdd()` 附近。

```ts
// 若 name 以 8 碼數字(YYYYMMDD)開頭且非當日,換成當日日期、保留其後字串。
// 寬鬆判斷:前 8 碼為數字即視為日期前綴,不驗證是否為合法日曆日期。
function rolloverDatePrefix(name: string): string {
  const m = /^(\d{8})(.*)$/.exec(name)
  if (!m) return name
  const today = todayYyyymmdd()
  return m[1] === today ? name : today + m[2]
}
```

要點:
- 不匹配(前 8 碼非純數字)→ 原樣回傳。
- 前綴已是今天 → 原樣回傳(不必要的字串重建也避免)。
- 保留 `m[2]`(可能是空字串、`_運動`、或任何後綴)。

## 2. 套用到預設值組裝

**檔案** [SelectedVideos.vue](frontend/src/components/SelectedVideos.vue) `loadSettings()`。把那段改成:

```ts
if (!download.targetDirPath) {
  const base = download.lastWorkDirName
    ? rolloverDatePrefix(download.lastWorkDirName)
    : todayYyyymmdd()
  download.targetDirPath = joinPath(outputPath.value, base)
}
```

- `lastWorkDirName` 為空 → 維持走 `todayYyyymmdd()`(行為不變)。
- 只翻新「帶入對話框的預設值」;**不要**回寫 localStorage、**不要**改後端 `target_dir` 任何邏輯。

---

## 3. 單元測試

**檔案** [frontend/src/tests/SelectedVideos.test.ts](frontend/src/tests/SelectedVideos.test.ts)。

由於 `rolloverDatePrefix` 目前是元件內區域函式,**請把它抽到可匯出的位置以利測試**(擇一,優先 a):
- (a) 新增 `frontend/src/utils/dateFolder.ts`,匯出 `todayYyyymmdd()` 與 `rolloverDatePrefix()`,元件改 import。純函式、最好測。
- (b) 若不想新增檔案,則 `export` 出這兩個函式並在測試直接 import 元件模組。

涵蓋 spec 的 5 個 scenario(用固定「今天」如 `20260602`,可 mock `Date` 或讓 `rolloverDatePrefix` 測試版注入 today;若抽成 utils,建議讓 `rolloverDatePrefix(name, today?)` 帶選用第二參數便於測試,預設仍用 `todayYyyymmdd()`):
- 純日期翻新:`20260601` → `20260602`
- 帶標籤翻新保留標籤:`20260601_運動` → `20260602_運動`
- 已是當日不變:`20260602_晚` → `20260602_晚`
- 無日期前綴不變:`運動` → `運動`
- 寬鬆判斷(非法日期仍翻新):`20261301_測試` → `20260602_測試`

---

## 4. 驗收(審查者會跑)

```bash
cd frontend && npm test            # 全綠
cd frontend && npm run type-check  # 乾淨
```
完成後**不要** archive、**不要**寫/跑 e2e。回報:改了哪些檔、新增哪些測試、上述兩條結果貼上。

---

## 不要碰

- 後端任何程式碼、`/download` 與 `target_dir` 的安全處理。
- localStorage `yt_mp3_last_work_dir` 的儲存格式與寫入時機([download.ts:107-108](frontend/src/stores/download.ts#L107) 不動)。
- `joinPath` / `basename` / `onDownload` 既有行為。
- 不驗證日期是否合法(寬鬆判斷是刻意的)。
