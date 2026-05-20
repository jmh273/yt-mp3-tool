# Spec: Latest Videos Feed

## Purpose

Defines the backend endpoint and frontend view for aggregating the most recent videos across all subscribed channels within a configurable time window. Covers the `/latest-videos` API (with optional per-request duration overrides), video duration enrichment on RSS responses, the disk-aware `downloaded_today` flag, the latest-videos-feed right-pane view with inline filter controls and dynamic badge, the "allow re-download" override toggle, and the settings control for the time range.

## Requirements

### Requirement: Latest videos endpoint
The backend SHALL expose `GET /latest-videos` with the following optional query parameters which control a single response (without modifying persisted settings):

- `hours` (integer, 1–168): time window in hours; defaults to `settings.latest_hours` (default 24) when omitted.
- `min_duration_minutes` (integer, ≥ 0): per-request override for the minimum duration filter; defaults to `settings.min_duration_minutes` when omitted.
- `max_duration_minutes` (integer, ≥ 1): per-request override for the maximum duration filter; defaults to `settings.max_duration_minutes` when omitted.

The endpoint SHALL concurrently fetch RSS feeds for all subscribed channels, apply the duration filter using the effective min/max (override if provided, else settings), and return videos published within the effective time window, sorted by `published` timestamp descending.

#### Scenario: Request with default hours
- **WHEN** a client calls `GET /latest-videos` without a `hours` parameter
- **THEN** the system SHALL use the `latest_hours` value from settings (default 24) and return matching videos

#### Scenario: Request with explicit hours
- **WHEN** a client calls `GET /latest-videos?hours=48`
- **THEN** the system SHALL return only videos published within the last 48 hours

#### Scenario: Request with duration overrides
- **WHEN** a client calls `GET /latest-videos?hours=24&min_duration_minutes=0&max_duration_minutes=120`
- **THEN** the system SHALL include videos whose duration falls within `[0, 120]` minutes regardless of `settings.min_duration_minutes` / `settings.max_duration_minutes`
- **AND** the persisted `settings.min_duration_minutes` and `settings.max_duration_minutes` SHALL be unchanged after the request

#### Scenario: Partial duration override
- **WHEN** a client calls `GET /latest-videos?min_duration_minutes=10` (with `max_duration_minutes` omitted)
- **THEN** the system SHALL apply `min_duration_minutes=10` and use `settings.max_duration_minutes` for the upper bound

#### Scenario: Channel RSS fetch fails
- **WHEN** one or more channel RSS requests time out or return an error
- **THEN** those channels SHALL be silently skipped and the endpoint SHALL still return results from the remaining channels

#### Scenario: No videos within time window
- **WHEN** no videos across all channels were published within the requested time window
- **THEN** the endpoint SHALL return `{"videos": []}` with HTTP 200

### Requirement: Video duration in response
Every video object returned by `/latest-videos` and `/subscriptions/{channel_id}/videos` SHALL include a `duration_seconds` field (integer, seconds) parsed from the RSS `media:content duration` attribute. If duration is unavailable the field SHALL be `null`.

#### Scenario: Duration available in RSS
- **WHEN** the RSS entry contains `<media:content duration="245"/>`
- **THEN** the video object SHALL include `"duration_seconds": 245`

#### Scenario: Duration missing from RSS
- **WHEN** the RSS entry has no `media:content duration` attribute
- **THEN** the video object SHALL include `"duration_seconds": null`

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

### Requirement: Latest videos feed view
The frontend SHALL display the latest-videos-feed view in the right pane when the "最新影片" button is clicked. The view SHALL show:

- A header containing the title "最新影片", a dynamic badge reflecting the currently effective filters (time range and duration range), and an inline filter control region.
- A loading indicator while fetching.
- Upon successful response, video cards sorted by publish time descending, each showing title, channel name, publish time, duration, and thumbnail.

#### Scenario: Feed loads successfully with defaults
- **WHEN** the latest-videos-feed view is activated for the first time
- **THEN** the inline filter controls SHALL be pre-populated from `settings.latest_hours`, `settings.min_duration_minutes`, and `settings.max_duration_minutes`
- **AND** a loading indicator SHALL be shown
- **AND** upon response the videos SHALL be rendered with title, channel name, relative publish time, and formatted duration

#### Scenario: Badge reflects current effective filters
- **WHEN** the view has loaded videos using `hours=24`, `min_duration_minutes=3`, `max_duration_minutes=60`
- **THEN** the badge SHALL display text equivalent to "24h · 3–60 分鐘"

#### Scenario: Duration displayed as MM:SS
- **WHEN** `duration_seconds` is 245
- **THEN** the UI SHALL display "4:05"

#### Scenario: Duration displayed as H:MM:SS for long videos
- **WHEN** `duration_seconds` is 3725
- **THEN** the UI SHALL display "1:02:05"

#### Scenario: Duration null displayed as dash
- **WHEN** `duration_seconds` is null
- **THEN** the UI SHALL display "—" in the duration field

#### Scenario: Video card is selectable for download
- **WHEN** the user checks the checkbox on a video card in the latest-videos-feed view
- **THEN** that video SHALL be added to the download selection (same behaviour as channel video cards)

### Requirement: Inline filter controls for latest videos feed
The latest-videos-feed view SHALL provide inline controls allowing the user to adjust the time range (hours), minimum duration (minutes), and maximum duration (minutes) for the current view, and to apply those values by triggering a new fetch. The controls SHALL be pre-populated from the user's saved settings on initial load. Adjustments made via these controls SHALL affect only the current fetch and SHALL NOT be written back to persisted settings.

#### Scenario: Controls pre-populated from settings on load
- **WHEN** the latest-videos-feed view is opened
- **THEN** the hours input SHALL show `settings.latest_hours`
- **AND** the min-duration input SHALL show `settings.min_duration_minutes`
- **AND** the max-duration input SHALL show `settings.max_duration_minutes`

#### Scenario: User adjusts controls and applies
- **WHEN** the user changes any of the three inputs and clicks the "套用" button
- **THEN** the frontend SHALL call `GET /latest-videos?hours=<h>&min_duration_minutes=<min>&max_duration_minutes=<max>` with the values currently in the inputs
- **AND** the resulting videos SHALL replace the previously displayed list
- **AND** the badge SHALL update to reflect the newly effective filters

#### Scenario: Apply does not persist to settings
- **WHEN** the user changes the inline controls and applies, then navigates to the settings page
- **THEN** the settings page SHALL still show the previously saved values, unchanged by the inline adjustment

#### Scenario: Hours validation
- **WHEN** the user enters a value outside 1–168 in the hours input
- **THEN** the input SHALL show a validation error and the "套用" button SHALL be disabled until corrected

#### Scenario: Duration range validation
- **WHEN** the user enters a min-duration greater than the max-duration, or a negative min-duration, or a max-duration less than 1
- **THEN** the input(s) SHALL show a validation error and the "套用" button SHALL be disabled until corrected

#### Scenario: Apply disabled while request in flight
- **WHEN** a fetch triggered by "套用" is in progress
- **THEN** the "套用" button SHALL be disabled and a loading indication SHALL be visible
- **AND** subsequent clicks SHALL NOT trigger additional concurrent requests

#### Scenario: Reopening the view resets controls to saved settings
- **WHEN** the user adjusts the controls, navigates away, and reopens the latest-videos-feed view
- **THEN** the controls SHALL again be pre-populated from `settings.latest_hours`, `settings.min_duration_minutes`, and `settings.max_duration_minutes`

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

### Requirement: Time range setting for latest videos
The settings page SHALL include a numeric input field "最新影片時間範圍（小時）" mapped to the `latest_hours` setting (integer, min 1, max 168). The default value SHALL be 24. This value SHALL be used as the default `hours` parameter when fetching the latest-videos-feed.

#### Scenario: User changes latest_hours setting
- **WHEN** the user sets "最新影片時間範圍" to 48 and saves
- **THEN** the next latest-videos-feed fetch SHALL use `?hours=48`

#### Scenario: Invalid value rejected
- **WHEN** the user enters a value outside 1–168
- **THEN** the input SHALL show a validation error and the save button SHALL be disabled
