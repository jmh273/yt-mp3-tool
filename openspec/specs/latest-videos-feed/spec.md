# Spec: Latest Videos Feed

## Purpose

Defines the backend endpoint and frontend view for aggregating the most recent videos across all subscribed channels within a configurable time window. Covers the `/latest-videos` API, video duration enrichment on RSS responses, the latest-videos-feed right-pane view, and the settings control for the time range.

## Requirements

### Requirement: Latest videos endpoint
The backend SHALL expose `GET /latest-videos?hours=<n>` which concurrently fetches RSS feeds for all subscribed channels and returns videos published within the last `<n>` hours, sorted by `published` timestamp descending.

#### Scenario: Request with default hours
- **WHEN** a client calls `GET /latest-videos` without a `hours` parameter
- **THEN** the system SHALL use the `latest_hours` value from settings (default 24) and return matching videos

#### Scenario: Request with explicit hours
- **WHEN** a client calls `GET /latest-videos?hours=48`
- **THEN** the system SHALL return only videos published within the last 48 hours

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

### Requirement: Latest videos feed view
The frontend SHALL display the latest-videos-feed view in the right pane when the "最新影片" button is clicked. The view SHALL show a loading indicator while fetching, then render videos sorted by publish time descending, each card showing title, channel name, publish time, duration, and thumbnail.

#### Scenario: Feed loads successfully
- **WHEN** the latest-videos-feed view is activated
- **THEN** a loading indicator SHALL be shown, and upon response the videos SHALL be rendered with title, channel name, relative publish time, and formatted duration

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

### Requirement: Time range setting for latest videos
The settings page SHALL include a numeric input field "最新影片時間範圍（小時）" mapped to the `latest_hours` setting (integer, min 1, max 168). The default value SHALL be 24. This value SHALL be used as the default `hours` parameter when fetching the latest-videos-feed.

#### Scenario: User changes latest_hours setting
- **WHEN** the user sets "最新影片時間範圍" to 48 and saves
- **THEN** the next latest-videos-feed fetch SHALL use `?hours=48`

#### Scenario: Invalid value rejected
- **WHEN** the user enters a value outside 1–168
- **THEN** the input SHALL show a validation error and the save button SHALL be disabled
