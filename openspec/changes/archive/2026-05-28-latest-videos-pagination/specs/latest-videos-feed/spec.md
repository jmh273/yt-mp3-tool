## MODIFIED Requirements

### Requirement: Latest videos endpoint
The backend SHALL expose `GET /latest-videos` with the following optional query parameters which control a single response (without modifying persisted settings):

- `hours` (integer, 1–168): time window in hours; defaults to `settings.latest_hours` (default 24) when omitted.
- `min_duration_minutes` (integer, ≥ 0): per-request override for the minimum duration filter; defaults to `settings.min_duration_minutes` when omitted.
- `max_duration_minutes` (integer, ≥ 1): per-request override for the maximum duration filter; defaults to `settings.max_duration_minutes` when omitted.

The endpoint SHALL concurrently fetch the latest videos for all subscribed channels, apply the duration filter using the effective min/max (override if provided, else settings), and return videos published within the effective time window, sorted by `published` timestamp descending.

The endpoint SHALL NOT impose any fixed maximum on the number of returned videos: every video matching the time window and duration filter SHALL be included in the response, regardless of count.

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

#### Scenario: Channel fetch fails
- **WHEN** one or more channel video requests time out or return an error
- **THEN** those channels SHALL be silently skipped and the endpoint SHALL still return results from the remaining channels

#### Scenario: No videos within time window
- **WHEN** no videos across all channels were published within the requested time window
- **THEN** the endpoint SHALL return `{"videos": []}` with HTTP 200

#### Scenario: Result set exceeds 100 videos
- **WHEN** more than 100 videos match the effective time window and duration filter
- **THEN** the response SHALL contain every matching video (more than 100), sorted by `published` descending
- **AND** the response SHALL NOT be truncated to any fixed count

## ADDED Requirements

### Requirement: Client-side pagination for latest videos feed
The latest-videos-feed view SHALL render the full result list one page at a time, with a fixed page size, to avoid rendering an unbounded number of cards at once. On a fresh load (or after "套用" re-fetches), the view SHALL display the first page only. A "載入更多" (load more) control SHALL append the next page of videos to the displayed list each time it is activated, preserving the order of the full list. When all videos are displayed, the "載入更多" control SHALL be hidden or disabled. Pagination is purely a display concern: it SHALL operate on the single already-fetched result list and SHALL NOT trigger additional `GET /latest-videos` requests.

#### Scenario: Initial load shows first page
- **WHEN** the feed loads a result list larger than one page (e.g. 248 videos with a page size of 50)
- **THEN** only the first page of videos (the 50 most recent) SHALL be rendered
- **AND** a "載入更多" control SHALL be visible

#### Scenario: Load more appends the next page
- **WHEN** the user activates the "載入更多" control while more videos remain undisplayed
- **THEN** the next page of videos SHALL be appended to the currently displayed list without removing the already-shown videos
- **AND** the relative order of all displayed videos SHALL remain publish-time descending
- **AND** no new network request to `/latest-videos` SHALL be made

#### Scenario: Load more hidden when fully displayed
- **WHEN** the displayed list already contains every video in the result set
- **THEN** the "載入更多" control SHALL be hidden or disabled

#### Scenario: Re-fetch resets pagination
- **WHEN** the user changes the inline filters and clicks "套用", triggering a new fetch
- **THEN** the displayed list SHALL reset to the first page of the new result set

#### Scenario: Small result set needs no load more
- **WHEN** the full result set fits within a single page (count ≤ page size)
- **THEN** all videos SHALL be displayed and the "載入更多" control SHALL NOT be shown

### Requirement: Count badge reflects total matches without cap warning
The latest-videos-feed view SHALL display a count badge reporting the total number of videos in the full result set. The badge SHALL NOT display any "已達上限" (limit reached) warning or advise the user to shorten the time window, because the result set is no longer capped. When the displayed list is shorter than the full result set (pagination in progress), the view SHALL also indicate how many videos are currently shown relative to the total.

#### Scenario: Badge shows total count
- **WHEN** the feed has loaded 248 matching videos
- **THEN** the count badge SHALL report 248 (the full total), not a capped value

#### Scenario: No cap warning shown
- **WHEN** the result set contains 100 or more videos
- **THEN** the count badge SHALL NOT show any "已達上限" wording nor advise shortening the time window

#### Scenario: Shown-vs-total indication while paginating
- **WHEN** 50 of 248 videos are currently displayed
- **THEN** the view SHALL indicate that 50 of 248 videos are shown
