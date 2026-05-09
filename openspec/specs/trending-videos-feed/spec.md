# Spec: Trending Videos Feed

## Purpose

Defines the backend endpoint and frontend view for displaying YouTube's Taiwan-region trending (mostPopular) videos. Covers the `/trending-videos` API including pagination, view count enrichment, the trending-videos-feed right-pane view, view count formatting, and the load-more interaction.

## Requirements

### Requirement: Trending videos endpoint returns Taiwan mostPopular chart
The backend SHALL expose `GET /trending-videos` which calls the YouTube Data API `videos.list` with `chart=mostPopular`, `regionCode=TW`, `maxResults=50`, and returns the resulting videos.

#### Scenario: Successful fetch
- **WHEN** a client calls `GET /trending-videos` with valid credentials
- **THEN** the system SHALL return HTTP 200 with body `{"videos": [...], "next_page_token": <string|null>}` and consume 1 quota unit

#### Scenario: Upcoming live broadcasts excluded
- **WHEN** an item in the YouTube response has `snippet.liveBroadcastContent == "upcoming"`
- **THEN** that item SHALL be excluded from the `videos` array

#### Scenario: Missing credentials
- **WHEN** a client calls `GET /trending-videos` without authenticated credentials
- **THEN** the system SHALL return an authentication error consistent with other endpoints (`require_credentials` behavior)

### Requirement: Trending videos response includes view count
Every video object returned by `/trending-videos` SHALL include a `view_count` field (integer, count of views) parsed from the YouTube Data API `statistics.viewCount` string. If `viewCount` is missing or unparseable, `view_count` SHALL be `0`.

#### Scenario: Statistics part included in API call
- **WHEN** the backend calls YouTube `videos.list`
- **THEN** the `part` parameter SHALL include `snippet`, `contentDetails`, and `statistics`

#### Scenario: viewCount available
- **WHEN** the YouTube response item has `statistics.viewCount = "1234567"`
- **THEN** the returned video object SHALL include `"view_count": 1234567`

#### Scenario: viewCount missing or invalid
- **WHEN** the YouTube response item has no `statistics.viewCount` field, or the value is not a valid integer
- **THEN** the returned video object SHALL include `"view_count": 0`

### Requirement: Trending videos endpoint does not apply duration filter
`GET /trending-videos` SHALL return all videos from the YouTube `mostPopular` chart regardless of `min_duration_minutes` / `max_duration_minutes` settings. The duration filter applied by other feeds SHALL NOT apply to this endpoint.

#### Scenario: Short video included
- **WHEN** YouTube returns a 30-second trending video and `min_duration_minutes` is 3
- **THEN** the video SHALL still appear in the response

#### Scenario: Long video included
- **WHEN** YouTube returns a 90-minute trending video and `max_duration_minutes` is 60
- **THEN** the video SHALL still appear in the response

#### Scenario: Settings unchanged for other feeds
- **WHEN** `/trending-videos` is called
- **THEN** the values of `min_duration_minutes` and `max_duration_minutes` in settings SHALL be unchanged, preserving filter behavior for `/latest-videos`, `/subscriptions/{channel_id}/videos`, and `/search/videos`

### Requirement: Trending videos endpoint supports pagination
`GET /trending-videos` SHALL accept an optional `page_token` query parameter and pass it as `pageToken` to the YouTube API. The response SHALL include a `next_page_token` field containing the next-page token from YouTube, or `null` if there are no more pages.

#### Scenario: Initial request without page_token
- **WHEN** a client calls `GET /trending-videos`
- **THEN** the YouTube API SHALL be called without `pageToken` and the response SHALL include `next_page_token` matching YouTube's `nextPageToken` (or `null` if absent)

#### Scenario: Subsequent request with page_token
- **WHEN** a client calls `GET /trending-videos?page_token=ABC123`
- **THEN** the YouTube API SHALL be called with `pageToken=ABC123` and the response SHALL contain the next 50 videos plus the new `next_page_token`

#### Scenario: Last page reached
- **WHEN** the YouTube API response does not include `nextPageToken`
- **THEN** the backend SHALL return `"next_page_token": null` in the response

### Requirement: Trending videos response shape
Each video object returned by `/trending-videos` SHALL include the fields: `video_id`, `title`, `published`, `thumbnail`, `url`, `channel_id`, `channel_title`, `duration_seconds`, and `view_count`.

#### Scenario: Field set complete
- **WHEN** a video is returned in the response
- **THEN** the object SHALL contain `video_id` (string), `title` (string), `published` (ISO8601 string), `thumbnail` (URL string), `url` (YouTube watch URL string), `channel_id` (string), `channel_title` (string), `duration_seconds` (integer), and `view_count` (integer)

### Requirement: Trending videos feed view
The frontend SHALL render the trending-videos-feed view when the trending videos navigation item is activated. The view SHALL show a loading indicator while fetching, then render videos in the existing card layout (thumbnail, checkbox, title, channel, date, duration).

#### Scenario: Initial load
- **WHEN** the trending-videos-feed view is activated
- **THEN** a loading indicator SHALL be shown, and upon successful response the videos SHALL be rendered

#### Scenario: Empty response
- **WHEN** the endpoint returns an empty `videos` array
- **THEN** the view SHALL show "目前沒有發燒影片"

#### Scenario: Initial load fails
- **WHEN** the initial request to `/trending-videos` fails
- **THEN** the view SHALL show an error message ("無法載入發燒影片：…") and SHALL NOT show the load-more button

### Requirement: Trending videos feed displays view count in meta line
For each trending video card, the meta line SHALL display the formatted view count alongside the publish date, separated by a middle dot (`·`). The format SHALL use 3 significant figures with `K` / `M` / `B` suffixes for English readability.

#### Scenario: View count under 1000
- **WHEN** `view_count` is 999
- **THEN** the meta line SHALL display "<date> · 999 views"

#### Scenario: View count in thousands
- **WHEN** `view_count` is 12345
- **THEN** the meta line SHALL display "<date> · 12.3K views"

#### Scenario: View count in millions, two decimals
- **WHEN** `view_count` is 1234567
- **THEN** the meta line SHALL display "<date> · 1.23M views"

#### Scenario: View count in millions, one decimal
- **WHEN** `view_count` is 12345678
- **THEN** the meta line SHALL display "<date> · 12.3M views"

#### Scenario: View count in millions, no decimal
- **WHEN** `view_count` is 123456789
- **THEN** the meta line SHALL display "<date> · 123M views"

#### Scenario: View count in billions
- **WHEN** `view_count` is 1234567890
- **THEN** the meta line SHALL display "<date> · 1.23B views"

#### Scenario: View count zero
- **WHEN** `view_count` is 0
- **THEN** the meta line SHALL display "<date> · 0 views"

### Requirement: Trending videos feed provides load-more button
When the response includes a non-null `next_page_token`, the trending-videos-feed view SHALL render a "載入更多" button below the video list. The button SHALL include the quota cost hint "(約消耗 1 配額)" and trigger another request to `/trending-videos?page_token=<token>` when clicked. New videos SHALL be appended to the existing list, deduplicated by `video_id`. The quota counter SHALL be refreshed after each load.

#### Scenario: Button visible when more pages exist
- **WHEN** the most recent response has `next_page_token` not null
- **THEN** the load-more button SHALL be visible

#### Scenario: Button hidden when no more pages
- **WHEN** the most recent response has `next_page_token` null
- **THEN** the load-more button SHALL NOT be rendered

#### Scenario: Button label includes quota hint
- **WHEN** the load-more button is rendered
- **THEN** the visible text SHALL include both "載入更多" and "(約消耗 1 配額)"

#### Scenario: Click loads next page and appends
- **WHEN** the user clicks the load-more button
- **THEN** the frontend SHALL call `GET /trending-videos?page_token=<current_token>`, append new videos to the displayed list (skipping any with a `video_id` already present), update `nextPageToken` from the response, and refresh the quota counter

#### Scenario: Loading state prevents double-click
- **WHEN** a load-more request is in flight
- **THEN** the button SHALL be disabled and SHALL display a loading indication

#### Scenario: Load-more failure preserves existing list
- **WHEN** a load-more request fails
- **THEN** the existing video list SHALL remain visible, an error message SHALL be displayed near the button, and the button SHALL return to a clickable state

#### Scenario: Page reload resets pagination
- **WHEN** the user reloads or re-activates the trending-videos-feed view
- **THEN** the request SHALL start from the first page with no `page_token`, replacing any previously loaded videos
