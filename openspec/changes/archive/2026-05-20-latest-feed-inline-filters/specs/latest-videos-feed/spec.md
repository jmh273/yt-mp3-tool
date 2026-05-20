## MODIFIED Requirements

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

## ADDED Requirements

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
