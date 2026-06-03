## Context

目前散布模型是「自用」最佳化：

- `scripts/build.bat` 第 5 步把 `tools/{ffmpeg.exe, mp3gain.exe, client_secret.json}` 一起 stage 進 bundle，再壓成 zip。
- `.github/workflows/release.yml` 在 CI 中從 secret 還原 `client_secret.json` 寫入 `tools/`，所以每個 release zip 都內含開發者個人的 OAuth 憑證。
- `backend/main.py` 的 `_find_client_secret()` 先找 exe 同目錄、再找 `backend/`；`_resource_path()` 把 exe 目錄塞進 PATH 讓內建 ffmpeg 被 `shutil.which()` 找到。
- `scripts/update.bat` 以 `gh` CLI 查最新 release、下載 zip，需 `gh auth login`。
- 密鑰現況乾淨：`client_secret.json` / `token.json` 從未進 git，`.gitignore` 已涵蓋。

要開源讓人自架，必須把「綁開發者」的兩處（內含憑證、gh 更新）拆掉，並補上自架者自帶憑證所需的中文文件與授權合規。本 change 只做**準備工作**，不含降低 GCP 門檻的一鍵引導開發。

## Goals / Non-Goals

**Goals:**
- 公開 release 與 CI 不再含個人 `client_secret.json`，ffmpeg/mp3gain 維持內建。
- `update.bat` 改為公開 URL 下載，去除 gh 依賴，仍保資料安全與版本比對。
- 一份能讓陌生自架者從零完成的繁中安裝指南（含 GCP/OAuth 全步驟）。
- 補 LICENSE、第三方授權聲明、ToS 免責，並完成開源衛生決策。

**Non-Goals:**
- 不做 GCP 設定的一鍵 / 自動引導（仍由自架者手動申請）。
- 不改 OAuth scope 行為（`youtube` 是否降為 `youtube.readonly` 留待另一個 change 評估）。
- 不真正按下 repo public、不發布開源 release（本 change 只做到「準備就緒」）。
- 不處理跨平台（維持 Windows-only）。

## Decisions

### D1：憑證改自架者自帶，從 build/CI 移除
- **做法**：build.bat 第 5 步移除 `client_secret.json` 複製（保留 ffmpeg/mp3gain）；缺 `tools/client_secret.json` 不再使 build 失敗。release.yml 移除注入 secret 的步驟。`_find_client_secret()` 既有「找 exe 同目錄」邏輯不變，自架者把自己的 json 放這即可。
- **替代方案**：保留內含但用「共用 demo 憑證」→ 否決，會共用配額並違反同意畫面測試者上限，且把開發者帳號暴露於風險。

### D2：缺憑證的執行期引導
- **做法**：`_find_client_secret()` 回 None 時，登入路徑回傳的訊息改為繁中、明確指向自架安裝文件與「放到 exe 同目錄」。
- **理由**：自架者第一個會撞到的就是這個，訊息品質直接決定能否自助解決。

### D3：update.bat 改 URL 下載（混合認證）
- **做法**：先打 GitHub releases API 取 tag + asset，再以 `Invoke-WebRequest` 下載。
  採**混合認證**：腳本自動偵測 token（`GH_TOKEN` 環境變數，否則嘗試 `gh auth token`）——
  - **有 token**：API 查詢帶 `Authorization`，下載走 asset API endpoint（`asset.url` + `Accept: application/octet-stream`）→ **私有 repo 也能更新**。
  - **無 token**：匿名查詢 + 下載 `browser_download_url` → **公開 repo 免登入、免 gh**。
  保留 `REPO` 環境變數覆寫、`_version.txt` 版本比對與「殺進程→解壓覆蓋→重啟」，使用者資料目錄不動。token 不經 batch 變數傳遞（查詢與下載各自於 PowerShell 內重新解析）。
- **為何混合**：維護者在 repo 公開**之前**會持續發私有 release；純匿名版會在新 update.bat 落到自己機器後、下一次更新就 404。混合版讓「私有過渡期（本機 gh 已登入）」與「未來公開（自架者無 gh）」**同一支腳本都能用**，不必再改。
- **仍符合自架 spec**：gh/token 僅為**選用加速**，公開情境完全不需要 → 「不依賴 gh」成立。
- **取捨**：私有 repo 的 asset 不能用 `browser_download_url`（需 session 認證），故 token 路徑改用 asset API endpoint。asset 命名需穩定（已是 `*-windows-x64.zip`）。
- **替代方案**：純匿名（否決，私有過渡期會壞）；繼續純 gh（否決，違背自架者無痛）。

### D4：第三方授權與 LICENSE
- **做法**：release zip 內放 `THIRD-PARTY-NOTICES`（ffmpeg/mp3gain GPL 條款 + 原始碼來源連結，ffmpeg 指 BtbN/FFmpeg-Builds 來源）。repo 根目錄加 `LICENSE`。README 加 ToS 免責。
- **理由**：散布 GPL 執行檔需附條款與原始碼取得方式；作為外部程序呼叫不構成衍生作品，聚合散布即可合規。
- **待定**：本專案自身 LICENSE 選 MIT 或 Apache-2.0（見 Open Questions）。

### D5：開源衛生
- **做法**：逐項決定 `.claude/`、`openspec/` 開發史、內部 `docs/`（`ai_code_editing_qa.md`、`refactoring_and_cross_ai_collaboration.md`）去留並落實。開源前跑一次密鑰稽核確認 history 乾淨。
- **理由**：這些非密鑰但會洩漏工作流；保留可作為「人＋AI 協作」展示，移除則更乾淨——屬可逆的編輯決策，留待 apply 時與使用者確認。

## Risks / Trade-offs

- [既有自用機器仍用內含憑證的舊 zip] → 本 change 不動既有已部署機器；新公開 release 才不含憑證，開發者自己的機器改用「自帶憑證」或維持舊版皆可。
- [自架者卡在 GCP 設定] → 以詳盡截圖式繁中文件緩解；門檻無法完全消除（Non-Goal）。
- [`latest/download` URL 依賴 asset 命名穩定] → 命名已固定且由 build.bat 決定，更新時一併確認。
- [GPL 合規疏漏] → 用 THIRD-PARTY-NOTICES 明列來源與條款；ffmpeg 採當前 BtbN GPL build。
- [誤把開發者憑證留在某處進公開 release] → CI/手動皆加一道「zip 不得含 client_secret.json」檢查。

## Migration Plan

1. 先做 build/CI 與 update.bat 的程式變更（可在私有狀態下驗證）。
2. 撰寫文件、LICENSE、第三方聲明。
3. 完成開源衛生決策與密鑰稽核。
4. 全部就緒後，按下 public 與發第一個開源 release 屬本 change 之外的後續動作。
- **Rollback**：本 change 不觸碰既有部署；若有問題，舊內含憑證的 release 仍可用，repo 維持私有即可。

## Resolved Decisions（原 Open Questions，已定）

- **LICENSE：MIT。** 最簡、生態最常見、無專利條款；「讓人方便用」即可，不需 Apache 的專利保護。注意這與內含的 GPL ffmpeg 不衝突——ffmpeg 是外部程序呼叫，不使本專案碼變 GPL。
- **`.claude/` 與 `openspec/` 開發史：全部保留。** 作為「人＋AI 協作開發」的展示與透明度賣點。前提是 6.2 密鑰稽核需確認 `.claude/` 內無敏感內容（如 `settings.local.json` 僅含非密鑰的指令白名單）。
- **文件語言：先純繁中。** 觸及以中文使用者為主，最快做完；日後要擴大再補英文 README（非本 change 範圍）。
