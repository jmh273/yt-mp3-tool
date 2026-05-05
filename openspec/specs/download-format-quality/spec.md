# Spec: Download Format & Quality

## Purpose

定義下載批次的格式（MP3 / MP4）與品質（音訊位元率 / 影片解析度）選擇機制。涵蓋 `SelectedVideos` 面板的雙下拉聯動 UI、`POST /download` payload 攜帶 `format` 與 `quality` 兩欄，以及後端 `run_download()` 依此分派 yt-dlp 設定。設計目標是在不破壞現有 mp3 / 192 預設行為的前提下，提供影片下載與更高音質選項。

## Requirements

### Requirement: 下載格式選項
系統 SHALL 在 `SelectedVideos` 面板提供「格式」下拉選單，允許使用者在 `mp3` 與 `mp4` 之間擇一。預設值 MUST 為 `mp3`。

#### Scenario: 預設值為 mp3
- **WHEN** 使用者開啟首頁並選取至少一支影片
- **THEN** 「格式」下拉選單顯示 `MP3` 為當前選項

#### Scenario: 切換為 mp4
- **WHEN** 使用者將「格式」切換為 `MP4`
- **THEN** UI 狀態更新為 `mp4`，下次下載將以 mp4 送出請求

### Requirement: 品質選項依格式聯動
系統 SHALL 提供「品質」下拉選單，其選項清單依「格式」動態變化：

- 當格式為 `mp3`：選項 MUST 為 `128`、`192`、`256`、`320`（單位 kbps），預設為 `192`
- 當格式為 `mp4`：選項 MUST 為 `360`、`480`、`720`、`1080`（單位 p），預設為 `720`

切換「格式」時，「品質」MUST 自動重置為該格式的預設值。

#### Scenario: MP3 預設品質為 192 kbps
- **WHEN** 使用者選擇格式 `MP3`
- **THEN** 「品質」下拉選單顯示 `192 kbps` 為當前選項，可選範圍為 `128 / 192 / 256 / 320 kbps`

#### Scenario: MP4 預設品質為 720p
- **WHEN** 使用者將格式切換為 `MP4`
- **THEN** 「品質」下拉選單自動切換為 `720p`，可選範圍為 `360 / 480 / 720 / 1080 p`

#### Scenario: 切回 MP3 重置品質
- **WHEN** 使用者選擇 MP4 + 1080p，再切回 MP3
- **THEN** 「品質」自動重置為 `192`（不保留 `1080`）

### Requirement: 下載請求攜帶格式與品質
系統 SHALL 在使用者觸發下載時，於 `POST /download` 請求 body 內附帶 `format`（字串：`mp3` 或 `mp4`）與 `quality`（整數：MP3 為 kbps、MP4 為 p）。

#### Scenario: 預設下載送出 mp3 / 192
- **WHEN** 使用者未調整選單，直接點擊「下載選取影片」
- **THEN** 前端送出 `POST /download`，body 包含 `format: "mp3"` 與 `quality: 192`

#### Scenario: 自訂組合送出對應值
- **WHEN** 使用者選擇 MP4 + 1080p 並點擊下載
- **THEN** 前端送出 `format: "mp4"` 與 `quality: 1080`

### Requirement: 後端依格式調度 yt-dlp
系統 SHALL 在 `run_download()` 內依請求的 `format` 與 `quality` 組裝對應的 `ydl_opts`：

- 當 `format == "mp3"`：使用 `FFmpegExtractAudio` postprocessor，`preferredcodec="mp3"`，`preferredquality=str(quality)`
- 當 `format == "mp4"`：使用 yt-dlp `format` selector `bestvideo[height<=<quality>][ext=mp4]+bestaudio[ext=m4a]/best[height<=<quality>][ext=mp4]/best`，輸出副檔名為 `.mp4`，不執行 audio extraction

`format` / `quality` 缺漏時 MUST fallback 為 `mp3` / `192`。

#### Scenario: 預設 mp3 / 192 行為不變
- **WHEN** `run_download()` 收到 `format="mp3", quality=192`
- **THEN** 產出 192 kbps 的 mp3 檔案，行為與現況一致

#### Scenario: MP3 高位元率
- **WHEN** `run_download()` 收到 `format="mp3", quality=320`
- **THEN** 產出 320 kbps 的 mp3 檔案

#### Scenario: MP4 受限於指定解析度上限
- **WHEN** `run_download()` 收到 `format="mp4", quality=720`
- **THEN** 下載最佳的 ≤720p mp4（含 audio），副檔名為 `.mp4`，不再轉 mp3

#### Scenario: 缺欄位時走預設
- **WHEN** `run_download()` 收到的請求沒有 `format` / `quality` 欄位
- **THEN** 視為 `format="mp3", quality=192` 處理
