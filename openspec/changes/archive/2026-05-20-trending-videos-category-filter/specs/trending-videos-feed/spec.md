## ADDED Requirements

### Requirement: Trending categories endpoint
The backend SHALL expose `GET /trending-videos/categories` which returns the curated list of selectable category filters for the trending videos feed. Each entry SHALL include `id` (string YouTube `videoCategoryId`, or `null` for the "all" entry) and `label` (display string in Traditional Chinese, may include emoji). The list SHALL be a backend-owned constant; the endpoint SHALL NOT consume YouTube Data API quota.

#### Scenario: Successful fetch
- **WHEN** an authenticated client calls `GET /trending-videos/categories`
- **THEN** the system SHALL return HTTP 200 with body `{"categories": [{"id": <string|null>, "label": <string>}, ...]}` and SHALL NOT call any YouTube Data API endpoint

#### Scenario: First entry is the "all" option
- **WHEN** the response is returned
- **THEN** the first entry SHALL be `{"id": null, "label": "全部"}`

#### Scenario: Initial category set
- **WHEN** the response is returned
- **THEN** the entries (in order) SHALL be: `{id: null, label: "全部"}`, `{id: "10", label: "🎵 音樂"}`, `{id: "20", label: "🎮 遊戲"}`, `{id: "24", label: "🎬 娛樂"}`, `{id: "25", label: "📰 新聞"}`, `{id: "17", label: "⚽ 運動"}`, `{id: "1", label: "🎞 電影"}`, `{id: "23", label: "😄 喜劇"}`

#### Scenario: Missing credentials
- **WHEN** a client calls `GET /trending-videos/categories` without authenticated credentials
- **THEN** the system SHALL return an authentication error consistent with other endpoints (`require_credentials` behavior)

### Requirement: Trending videos feed displays category chip row
The trending-videos-feed view SHALL render a horizontal row of chip controls above the video grid. The chips SHALL be populated by calling `GET /trending-videos/categories` on view activation. Exactly one chip SHALL be visually marked as active at any time; on initial load, the "全部" chip SHALL be active.

#### Scenario: Chips load on view activation
- **WHEN** the trending-videos-feed view is activated
- **THEN** the frontend SHALL call `GET /trending-videos/categories` and render one chip per returned entry, in the response order

#### Scenario: Default active chip
- **WHEN** the chips first render
- **THEN** the "全部" chip SHALL be active and the initial `GET /trending-videos` request SHALL omit the `category` parameter

#### Scenario: Categories fetch fails
- **WHEN** `GET /trending-videos/categories` fails
- **THEN** the view SHALL fall back to rendering only the "全部" chip (active) and proceed with the standard trending fetch

### Requirement: Trending videos feed resets when category chip changes
When the user clicks a chip that is not currently active, the view SHALL clear the displayed video list, reset the in-memory `next_page_token`, mark the clicked chip as active, and issue a fresh `GET /trending-videos` request with the new `category` value (or no `category` for the "全部" chip).

#### Scenario: Switching from "全部" to a category
- **WHEN** "全部" is active and the user clicks the "🎵 音樂" chip
- **THEN** the existing video list SHALL be cleared, `next_page_token` SHALL be reset, "🎵 音樂" SHALL become the active chip, and the frontend SHALL call `GET /trending-videos?category=10`

#### Scenario: Switching between categories
- **WHEN** "🎵 音樂" is active and the user clicks the "🎮 遊戲" chip
- **THEN** the existing video list SHALL be cleared, `next_page_token` SHALL be reset, "🎮 遊戲" SHALL become the active chip, and the frontend SHALL call `GET /trending-videos?category=20`

#### Scenario: Clicking the active chip is a no-op
- **WHEN** a chip is already active and the user clicks it again
- **THEN** the existing video list SHALL remain unchanged and no new request SHALL be issued

#### Scenario: Empty result for a category
- **WHEN** a category fetch returns an empty `videos` array
- **THEN** the view SHALL show "目前沒有發燒影片" and the load-more button SHALL NOT be rendered

#### Scenario: Selection does not persist across view switches
- **WHEN** the user activates another view (e.g. latest videos) and then re-activates the trending-videos-feed view
- **THEN** the active chip SHALL reset to "全部" and the fetch SHALL start fresh without a `category` parameter

## MODIFIED Requirements

### Requirement: Trending videos endpoint returns Taiwan mostPopular chart
The backend SHALL expose `GET /trending-videos` which calls the YouTube Data API `videos.list` with `chart=mostPopular`, `regionCode=TW`, `maxResults=50`, and returns the resulting videos. The endpoint SHALL accept an optional `category` query parameter; when present and valid, the backend SHALL pass `videoCategoryId=<category>` to the YouTube call. When absent, the backend SHALL NOT pass `videoCategoryId` and behavior SHALL match prior behavior.

#### Scenario: Successful fetch
- **WHEN** a client calls `GET /trending-videos` with valid credentials
- **THEN** the system SHALL return HTTP 200 with body `{"videos": [...], "next_page_token": <string|null>}` and consume 1 quota unit

#### Scenario: Upcoming live broadcasts excluded
- **WHEN** an item in the YouTube response has `snippet.liveBroadcastContent == "upcoming"`
- **THEN** that item SHALL be excluded from the `videos` array

#### Scenario: Missing credentials
- **WHEN** a client calls `GET /trending-videos` without authenticated credentials
- **THEN** the system SHALL return an authentication error consistent with other endpoints (`require_credentials` behavior)

#### Scenario: Category parameter passed through
- **WHEN** a client calls `GET /trending-videos?category=10`
- **THEN** the YouTube `videos.list` call SHALL include `videoCategoryId=10`, and the response SHALL still consume only 1 quota unit

#### Scenario: Category parameter omitted preserves prior behavior
- **WHEN** a client calls `GET /trending-videos` without a `category` parameter
- **THEN** the YouTube `videos.list` call SHALL NOT include `videoCategoryId`, and the returned chart SHALL match the prior (all-category) Taiwan mostPopular result

#### Scenario: Invalid category rejected
- **WHEN** a client calls `GET /trending-videos?category=99` (or any value not in the backend whitelist)
- **THEN** the system SHALL return HTTP 400 with an error message indicating the category is not supported, and SHALL NOT call the YouTube API

#### Scenario: Whitelisted categories
- **WHEN** evaluating the `category` parameter
- **THEN** the backend SHALL accept exactly these values: `"10"`, `"20"`, `"24"`, `"25"`, `"17"`, `"1"`, `"23"` (and SHALL treat absent/empty as "all")

### Requirement: Trending videos endpoint supports pagination
`GET /trending-videos` SHALL accept an optional `page_token` query parameter and pass it as `pageToken` to the YouTube API. The response SHALL include a `next_page_token` field containing the next-page token from YouTube, or `null` if there are no more pages. When a request includes both `page_token` and `category`, both SHALL be passed to the YouTube API in the same call.

#### Scenario: Initial request without page_token
- **WHEN** a client calls `GET /trending-videos`
- **THEN** the YouTube API SHALL be called without `pageToken` and the response SHALL include `next_page_token` matching YouTube's `nextPageToken` (or `null` if absent)

#### Scenario: Subsequent request with page_token
- **WHEN** a client calls `GET /trending-videos?page_token=ABC123`
- **THEN** the YouTube API SHALL be called with `pageToken=ABC123` and the response SHALL contain the next 50 videos plus the new `next_page_token`

#### Scenario: Last page reached
- **WHEN** the YouTube API response does not include `nextPageToken`
- **THEN** the backend SHALL return `"next_page_token": null` in the response

#### Scenario: Pagination preserves category
- **WHEN** a client calls `GET /trending-videos?category=10&page_token=ABC123`
- **THEN** the YouTube `videos.list` call SHALL include both `videoCategoryId=10` and `pageToken=ABC123`

### Requirement: Trending videos feed provides load-more button
When the response includes a non-null `next_page_token`, the trending-videos-feed view SHALL render a "載入更多" button below the video list. The button SHALL include the quota cost hint "(約消耗 1 配額)" and trigger another request to `/trending-videos?page_token=<token>` (with the currently active `category`, if any) when clicked. New videos SHALL be appended to the existing list, deduplicated by `video_id`. The quota counter SHALL be refreshed after each load.

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
- **THEN** the frontend SHALL call `GET /trending-videos?page_token=<current_token>` (including `&category=<id>` if a category chip other than "全部" is active), append new videos to the displayed list (skipping any with a `video_id` already present), update `nextPageToken` from the response, and refresh the quota counter

#### Scenario: Loading state prevents double-click
- **WHEN** a load-more request is in flight
- **THEN** the button SHALL be disabled and SHALL display a loading indication

#### Scenario: Load-more failure preserves existing list
- **WHEN** a load-more request fails
- **THEN** the existing video list SHALL remain visible, an error message SHALL be displayed near the button, and the button SHALL return to a clickable state

#### Scenario: Page reload resets pagination
- **WHEN** the user reloads or re-activates the trending-videos-feed view
- **THEN** the request SHALL start from the first page with no `page_token`, replacing any previously loaded videos
