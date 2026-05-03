## ADDED Requirements

### Requirement: Target loudness setting
The system SHALL persist a `normalize_target_db` setting (float, units **dB SPL**, mp3gain ReplayGain reference) representing the target loudness used for batch normalization. The default SHALL be `89.0`. The accepted range SHALL be `80.0` to `100.0` inclusive.

#### Scenario: Default value when settings file is fresh
- **WHEN** the settings file does not contain `normalize_target_db`
- **THEN** `GET /settings` SHALL return `normalize_target_db: 89.0`

#### Scenario: User updates target loudness
- **WHEN** the user submits `PUT /settings` with `normalize_target_db: 92.0`
- **THEN** the response SHALL include `normalize_target_db: 92.0` and subsequent `GET /settings` SHALL return the same value

#### Scenario: Out-of-range value rejected
- **WHEN** `PUT /settings` is called with `normalize_target_db: 75.0` or `normalize_target_db: 105.0`
- **THEN** the endpoint SHALL respond `422` with a message indicating the allowed range is `80.0` to `100.0`

### Requirement: Filename sanitization on download
The download flow SHALL sanitize the YouTube video title before passing it to yt-dlp's output template, so that the resulting MP3 filename contains only characters that mp3gain can read on Windows.

The sanitizer SHALL apply two passes:

1. **Block-level filter**: preserve ASCII letters, digits, spaces, `.-_()`, CJK Unified Ideographs (`U+4E00–U+9FFF`) and CJK Extension A (`U+3400–U+4DBF`). All other characters (full-width punctuation `｜「」『』【】，。？！：；（）│⧸＊…`, emoji, miscellaneous symbols) SHALL be replaced with `_`.
2. **Codepage filter**: any character that survives step 1 but cannot be encoded by the active system codepage (`locale.getpreferredencoding(False)` — typically CP950 on Traditional Chinese Windows, CP936 on Simplified, CP932 on Japanese) SHALL also be replaced with `_`. This catches rare CJK ideographs like `U+7287` (the variant of 犇) which sit in the Unified Ideographs block but are absent from the legacy ANSI codepage that `mp3gain.exe` reads its argv through.

After both passes: consecutive `_` SHALL be collapsed to one; trailing `.` ` ` `_` SHALL be stripped (Windows reserved + cleanliness); the result SHALL be truncated to at most 120 characters; an empty result SHALL fall back to `"untitled"`.

#### Scenario: Title containing full-width punctuation
- **WHEN** the YouTube title is `馬斯克太空 AI 夢碎？「這一條線」｜EP.203`
- **THEN** the saved file SHALL be named `馬斯克太空 AI 夢碎_這一條線_EP.203.mp3` (each `？`, `「`, `」`, `｜` is replaced with `_`, runs of `_` are collapsed to one)

#### Scenario: Title containing emoji
- **WHEN** the YouTube title is `重磅🔥分析 2026/05/01`
- **THEN** the emoji and `/` SHALL be replaced with `_` in the saved filename

#### Scenario: CJK characters preserved
- **WHEN** the YouTube title is `台積電股價分析`
- **THEN** the saved filename SHALL retain `台積電股價分析` (no replacement of CJK ideographs)

#### Scenario: Rare CJK ideograph not in system codepage
- **WHEN** the YouTube title contains `U+7287` (variant of 犇) on a Traditional Chinese Windows host (CP950)
- **THEN** that character SHALL be replaced with `_` so the resulting filename is reachable by mp3gain.exe via ANSI argv

### Requirement: List MP3 files in a directory
The backend SHALL expose `GET /normalize/list?dir=<absolute_path>` that returns the MP3 files (case-insensitive `.mp3` suffix, non-recursive) in the given directory, marking files whose names contain characters mp3gain cannot handle.

The response SHALL be `{"directory": "<dir>", "files": [{"filename": str, "size_bytes": int, "needs_rename": bool, "suggested_name": str}, ...]}` sorted by filename ascending. `needs_rename` SHALL be true iff `suggested_name != filename` after applying the same sanitizer used at download time. `suggested_name` SHALL be unique within the response (a numeric suffix `-2`, `-3`, ... appended on collision).

#### Scenario: Valid directory with mp3gain-safe MP3s
- **WHEN** the directory exists and all MP3 filenames are mp3gain-safe
- **THEN** the response SHALL list each file with `needs_rename: false` and `suggested_name == filename`

#### Scenario: Valid directory with mp3gain-unsafe MP3s
- **WHEN** the directory contains `馬斯克太空 AI 夢碎？.mp3`
- **THEN** that file's response entry SHALL have `needs_rename: true` and a `suggested_name` containing no `？`

#### Scenario: Valid directory with no MP3s
- **WHEN** the directory exists but contains no `.mp3` files
- **THEN** the endpoint SHALL respond `200` with `{"directory": "<dir>", "files": []}`

#### Scenario: Directory does not exist
- **WHEN** the path does not exist or is not a directory
- **THEN** the endpoint SHALL respond `400` with a descriptive error

#### Scenario: Subdirectories ignored
- **WHEN** the directory contains a subdirectory `sub/` with MP3s inside it
- **THEN** the response SHALL NOT include files from `sub/`

### Requirement: Rename mp3gain-unsafe files
The backend SHALL expose `POST /normalize/rename` accepting `{directory: string, renames: [{from: string, to: string}, ...]}` that atomically renames each file within the directory. It SHALL append each rename to `<directory>/_rename_log.json` for manual rollback if needed.

#### Scenario: All renames succeed
- **WHEN** every `from` file exists in `directory` and every `to` does not
- **THEN** each file SHALL be renamed and `_rename_log.json` SHALL grow to include the mapping with a timestamp

#### Scenario: Rename target collides with existing file
- **WHEN** any `to` already exists in `directory` and is not its own `from`
- **THEN** that rename SHALL be skipped, the response SHALL include it under `skipped`, and the remaining renames SHALL still proceed

#### Scenario: from / to outside directory rejected
- **WHEN** any `from` or `to` contains a path separator or resolves outside `directory`
- **THEN** the endpoint SHALL respond `400` and perform no renames

### Requirement: Start a normalization batch
The backend SHALL expose `POST /normalize/start` that accepts `{directory: string, filenames: string[], target_db?: float}` and starts a background batch normalization. It SHALL return `{task_id: string}` on success. If `target_db` is omitted the system SHALL use the saved `normalize_target_db` setting; if provided it SHALL be validated against the same range and used for this batch only (not persisted).

#### Scenario: Batch starts successfully
- **WHEN** the directory exists, all `filenames` are non-recursive MP3 files within it, and mp3gain is available
- **THEN** the endpoint SHALL respond `200` with a `task_id` and begin processing the files in the background

#### Scenario: Per-batch target_db overrides setting
- **WHEN** `target_db: 92.0` is provided in the request body
- **THEN** the batch SHALL use `92.0` as its target regardless of the persisted setting, and `target_db` in each item's progress state SHALL reflect `92.0`

#### Scenario: Per-batch target_db out of range rejected
- **WHEN** the request body's `target_db` is `75.0` or `105.0`
- **THEN** the endpoint SHALL respond `422` and start no work

#### Scenario: mp3gain missing
- **WHEN** `mp3gain` is not on PATH
- **THEN** the endpoint SHALL respond `503` with a message instructing the user to install mp3gain

#### Scenario: Filename outside directory rejected
- **WHEN** any entry in `filenames` contains a path separator or resolves outside `directory`
- **THEN** the endpoint SHALL respond `400` and start no work

#### Scenario: Concurrent batch on same directory rejected
- **WHEN** a batch is already running for the same directory
- **THEN** the endpoint SHALL respond `409` and start no new task

### Requirement: Stream normalization progress
The backend SHALL expose `GET /normalize/progress/{task_id}` as a Server-Sent Events stream that pushes the full task state every 0.5 seconds until the task completes.

The state object SHALL have shape:
```
{
  "status": "running" | "done",
  "items": {
    "<filename>": {
      "filename": string,
      "status": "pending" | "measuring" | "normalizing" | "skipped" | "done" | "error",
      "measured_db": number|null,           // populated after the analyze step (current ReplayGain dB)
      "target_db": number,                  // dB SPL target used for this batch
      "recommended_db_change": number|null, // populated after analyze: the dB delta mp3gain would apply
      "error": string|null
    }
  }
}
```

Per-file progress is reported by status transition only (mp3gain runs are short — typically <1 second per file — so a continuous percent is omitted).

#### Scenario: Task in progress
- **WHEN** a client connects while the batch is running
- **THEN** the stream SHALL emit `data: <json>\n\n` events containing the current state, including each file's `status` transition

#### Scenario: Task completes
- **WHEN** the last file finishes
- **THEN** the stream SHALL emit a final event with `status: "done"` and close the connection

#### Scenario: Unknown task id
- **WHEN** the `task_id` is not known
- **THEN** the stream SHALL emit a single `data: {"error": "task not found"}\n\n` event and close

### Requirement: Skip files already at target loudness
For each file, after the analyze step completes, the system SHALL evaluate `recommended_db_change`. If `abs(recommended_db_change) < 0.75` (mp3gain step is 1.5 dB, so a delta below half a step rounds to zero anyway), the system SHALL skip the apply step, leave the original file untouched, and mark the item with `status: "skipped"`. The batch SHALL continue with the next file.

#### Scenario: File within tolerance is skipped
- **WHEN** mp3gain reports `Recommended Track dB change: 0.30` for a file
- **THEN** the item SHALL transition `pending → measuring → skipped` (no `normalizing` phase) and the original file SHALL NOT be modified

#### Scenario: File outside tolerance is normalized
- **WHEN** mp3gain reports `Recommended Track dB change: 4.50` for a file
- **THEN** the item SHALL transition `pending → measuring → normalizing → done` and the file's mp3 frame headers SHALL be modified to apply that gain

#### Scenario: Boundary near half-step
- **WHEN** mp3gain reports `Recommended Track dB change: -0.74`
- **THEN** the item SHALL be skipped (under the half-step threshold)

### Requirement: Single-pass mp3gain with original file preservation on failure
For each file the system SHALL invoke mp3gain to (a) analyze the current loudness and (b) when needed, apply the gain in-place by modifying mp3 frame headers (`-r -k -d <target_db - 89>`). On any failure (mp3gain non-zero exit, parse error, missing file) the original file SHALL remain unchanged, the item SHALL be marked `error` with the captured stderr, and the batch SHALL continue with the next file.

#### Scenario: Successful normalization
- **WHEN** the analyze and apply commands both exit `0`
- **THEN** the item status SHALL transition `pending → measuring → normalizing → done` and the file's mp3 frame headers SHALL reflect the new gain (no audio re-encoding occurs)

#### Scenario: mp3gain fails on a file
- **WHEN** mp3gain exits non-zero (e.g., the file is not a valid MP3 or the path contains characters mp3gain cannot read)
- **THEN** the item SHALL become `error` with an `error` message containing the captured stderr tail, the original file SHALL remain unchanged, and the batch SHALL continue with the next file

#### Scenario: Measured loudness reported
- **WHEN** the analyze step completes
- **THEN** the item's `measured_db` and `recommended_db_change` fields SHALL be set before the next status transition

### Requirement: Right pane tabbed between download and normalizer
The right pane SHALL contain a tab bar at the top with two tabs — "下載" and "音量正規化" — and SHALL show only the active tab's panel underneath. The default active tab SHALL be "下載". The active tab's panel SHALL receive the full height of the right pane.

#### Scenario: Default tab on first render
- **WHEN** the home page loads
- **THEN** the "下載" tab SHALL be active and the volume normalizer panel SHALL not be visible

#### Scenario: User switches to normalizer
- **WHEN** the user clicks the "音量正規化" tab
- **THEN** the download panel SHALL be hidden and the volume normalizer panel SHALL be displayed in the full height of the right pane

#### Scenario: Tab switch preserves panel state
- **WHEN** the user loads a directory in the normalizer, switches to "下載", then switches back to "音量正規化"
- **THEN** the previously loaded directory and file list SHALL still be displayed (no re-fetch required)

#### Scenario: Background task indicator
- **WHEN** a normalization task is running and the user is viewing the "下載" tab
- **THEN** the "音量正規化" tab label SHALL display a small running indicator (e.g., a dot) but SHALL NOT auto-switch the active tab

### Requirement: Volume normalizer panel in right pane
The frontend SHALL provide a "音量正規化" panel in the right pane that:
- Provides a directory input prefilled with `<output_path>/<YYYYMMDD-today>` on first open
- Has a "載入" button that calls `GET /normalize/list` and renders the resulting MP3 list
- Provides a numeric "本次目標 (dB)" input prefilled with the saved `normalize_target_db` and bounded to `80..100`; this value is sent as `target_db` in `POST /normalize/start` (per-batch override only — not persisted)
- Has a "開始正規化" button (disabled while a task is running or when the file list is empty) that calls `POST /normalize/start` and then subscribes to the SSE progress stream
- When any file in the loaded list has `needs_rename: true`, displays a "重新命名 N 個檔案" button that calls `POST /normalize/rename` with the suggested mapping and reloads the list afterwards
- Renders each file with its current status, and (when available) `measured_db → target_db dB` and the `recommended_db_change` value
- Renders `skipped` files with a distinct "已符合" badge visually different from the `done` state
- Displays a clear notice that running normalization will overwrite the original file's gain (in-place, lossless via mp3gain)
- Displays a batch summary on completion showing the count of `done`, `skipped`, and `error` files

#### Scenario: Panel opens with default directory
- **WHEN** the panel opens
- **THEN** the directory input SHALL be prefilled with `<output_path>/<YYYYMMDD>` where `YYYYMMDD` is today's date in the user's local time

#### Scenario: Per-batch target prefilled and editable
- **WHEN** the panel opens and the saved `normalize_target_db` is `89.0`
- **THEN** the "本次目標 (dB)" input SHALL show `89.0` and the user SHALL be able to change it before clicking "開始正規化"

#### Scenario: User loads a directory with no MP3s
- **WHEN** the user clicks "載入" against a directory containing no MP3 files
- **THEN** the panel SHALL display an empty-state message such as "此目錄沒有 MP3 檔案" and the "開始正規化" button SHALL be disabled

#### Scenario: User starts normalization
- **WHEN** the user clicks "開始正規化" with a non-empty list
- **THEN** the panel SHALL display each file's status updating in real time

#### Scenario: A file fails mid-batch
- **WHEN** mp3gain fails on one file
- **THEN** that file's row SHALL display an error state with the error message, and the remaining files SHALL continue to process

#### Scenario: A file already at target loudness
- **WHEN** a file's current loudness is within tolerance of the target
- **THEN** that file's row SHALL display a "已符合" badge with the measured dB value, and the file SHALL not be modified

#### Scenario: Files needing rename are flagged with action
- **WHEN** at least one loaded file has `needs_rename: true`
- **THEN** the panel SHALL display a "重新命名 N 個檔案" button alongside the file list, and clicking it SHALL invoke `POST /normalize/rename` and reload the list

### Requirement: Settings page exposes target loudness field
The settings page SHALL include a numeric input "目標響度（dB SPL）" bound to `normalize_target_db`. The field SHALL accept values from `80.0` to `100.0` and SHALL show a validation error for out-of-range or non-numeric input. The save button SHALL be disabled while the validation error is present. A short helper text SHALL note "89 = mp3gain 預設；接近 YouTube 響度建議 92–93".

#### Scenario: Field shows current value
- **WHEN** the settings page loads
- **THEN** the "目標響度（dB SPL）" field SHALL display the current `normalize_target_db` value (default `89.0` if never set)

#### Scenario: Out-of-range value blocks save
- **WHEN** the user enters `75` or `105`
- **THEN** the field SHALL show a validation error and the save button SHALL be disabled

#### Scenario: Valid value saves
- **WHEN** the user enters `92` and clicks save
- **THEN** the page SHALL call `PUT /settings` with `normalize_target_db: 92.0` and SHALL show a success indicator on the response
