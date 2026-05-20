## ADDED Requirements

### Requirement: Downloaded-today flag in latest videos response
Every video object returned by `GET /latest-videos` SHALL include a boolean field `downloaded_today`. The value SHALL be `true` when a file under the today's date subdirectory of the configured download output path (`<output_path>/<YYYYMMDD>/`, where `<YYYYMMDD>` is computed with the same local-time rule used by `POST /download`) has a stem (filename minus extension) that — after stripping any leading `^\d+_` sequence-number prefix — equals `_sanitize_filename(video.title)`. Otherwise the value SHALL be `false`.

Filenames ending with `.part` (in-progress yt-dlp downloads) and entries that are not regular files SHALL be excluded from the comparison set. If today's date subdirectory does not exist, the comparison set SHALL be empty and every video SHALL receive `downloaded_today: false`.

This flag SHALL be present on `/latest-videos` only; `/subscriptions/{channel_id}/videos`, `/trending-videos`, and `/search-videos` SHALL NOT add it.

#### Scenario: File present in today's folder
- **WHEN** the video `title` sanitises to `"My Talk"` and today's folder contains a file `03_My Talk.mp3`
- **THEN** the corresponding video object in the response SHALL have `"downloaded_today": true`

#### Scenario: File present without sequence prefix
- **WHEN** the video title sanitises to `"My Talk"` and today's folder contains a file `My Talk.mp3` (no sequence prefix, e.g. legacy downloads)
- **THEN** the response SHALL still set `"downloaded_today": true`

#### Scenario: No matching file in today's folder
- **WHEN** today's folder is empty, or contains only files whose stems (after stripping `^\d+_`) do not equal the sanitized title
- **THEN** the response SHALL set `"downloaded_today": false`

#### Scenario: Today's folder does not exist
- **WHEN** `<output_path>/<YYYYMMDD>/` is missing on disk
- **THEN** every video SHALL have `"downloaded_today": false` and the endpoint SHALL still return HTTP 200

#### Scenario: In-progress .part files ignored
- **WHEN** today's folder contains `05_My Talk.mp3.part` and no completed `.mp3` with that stem
- **THEN** the response SHALL set `"downloaded_today": false` for the matching video

#### Scenario: Other feeds unaffected
- **WHEN** the same video appears in `/subscriptions/{channel_id}/videos`, `/trending-videos`, or `/search-videos`
- **THEN** the returned video object SHALL NOT include a `downloaded_today` field

### Requirement: Disable selection of videos already downloaded today
The latest-videos-feed view SHALL, by default, disable the download checkbox of any video whose `downloaded_today` is `true`, in addition to the existing rule that disables checkboxes for videos already marked as downloaded in the session via the download store. The "✅ 已下載" badge SHALL be shown for videos meeting either of these conditions, regardless of whether the checkbox is currently disabled or has been re-enabled via the override described in the next requirement.

#### Scenario: Disk match disables checkbox
- **WHEN** a video card is rendered, its `downloaded_today` is `true`, and the "允許再次下載" override is OFF
- **THEN** its checkbox SHALL be `disabled` and its title row SHALL show the "✅ 已下載" badge

#### Scenario: Disk match excludes from selection toggle
- **WHEN** the user clicks on the disabled checkbox of a video flagged `downloaded_today: true` (with override OFF)
- **THEN** no change SHALL occur in the download selection store

#### Scenario: Session-marked downloads still disable
- **WHEN** a video has `downloaded_today: false` from the backend but `download.isDownloaded(video_id)` returns `true` (e.g. just completed in this session), and the override is OFF
- **THEN** the checkbox SHALL remain disabled and the badge SHALL remain visible

### Requirement: "Allow re-download" override toggle
The latest-videos-feed view SHALL provide a toggle control labelled "允許再次下載" (or equivalent) in its filter-bar region, defaulting to OFF on every mount. When the toggle is ON, the checkboxes of videos whose `downloaded_today` is `true` AND/OR whose `download.isDownloaded(video_id)` is `true` SHALL be enabled and the user SHALL be able to add them to the download selection like any other video. The "✅ 已下載" badge SHALL continue to be displayed on those videos, providing visual feedback that they have already been downloaded. The toggle state SHALL NOT be persisted to settings or to localStorage; navigating away from the view and back SHALL reset the toggle to OFF.

#### Scenario: Toggle default state on view open
- **WHEN** the user opens the latest-videos-feed view
- **THEN** the "允許再次下載" toggle SHALL be OFF

#### Scenario: Turning toggle ON re-enables checkboxes
- **WHEN** a video has `downloaded_today: true` and the user switches the toggle to ON
- **THEN** the video's checkbox SHALL no longer be `disabled`
- **AND** the "✅ 已下載" badge SHALL still be visible on that card

#### Scenario: Selecting an already-downloaded video with override ON
- **WHEN** the toggle is ON and the user clicks the checkbox of a `downloaded_today: true` video
- **THEN** the video SHALL be added to the download selection store
- **AND** subsequent download flow SHALL treat it the same as any other newly selected video (no special back-end gating)

#### Scenario: Turning toggle OFF restores disabled state
- **WHEN** the toggle is switched from ON back to OFF and any already-downloaded videos are currently selected
- **THEN** those videos SHALL be removed from the download selection store
- **AND** their checkboxes SHALL be `disabled` again with the badge visible

#### Scenario: Override not persisted across mounts
- **WHEN** the user turns the toggle ON, navigates away (e.g. to a channel) and returns to the latest-videos-feed view
- **THEN** the toggle SHALL be OFF again
- **AND** any previously re-enabled, already-downloaded videos SHALL be `disabled` again
