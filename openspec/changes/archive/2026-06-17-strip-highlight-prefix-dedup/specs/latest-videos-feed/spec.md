## MODIFIED Requirements

### Requirement: Downloaded-today flag in latest videos response
Every video object returned by `GET /latest-videos` SHALL include a boolean field `downloaded_today`. The value SHALL be `true` when a file under the today's date subdirectory of the configured download output path (`<output_path>/<YYYYMMDD>/`, where `<YYYYMMDD>` is computed with the same local-time rule used by `POST /download`) has a stem (filename minus extension) that — after stripping any leading `^\d+_` sequence-number prefix **and then normalizing away a leading `【精華】` highlight marker** — equals the highlight-normalized form of `_sanitize_filename(video.title)`. Otherwise the value SHALL be `false`.

The highlight-prefix normalization SHALL be applied symmetrically to both the on-disk stem and the sanitized candidate title, so that a title such as `【精華】My Talk` (whose sanitized stem is `精華_My Talk`) compares equal to a previously downloaded `My Talk`, and vice versa. The normalization SHALL only remove a single leading `精華` token together with any immediately following separator (`_`/space) that results from sanitizing the full-width brackets `【】`; it SHALL NOT remove the substring `精華` when it appears elsewhere in the title.

Filenames ending with `.part` (in-progress yt-dlp downloads) and entries that are not regular files SHALL be excluded from the comparison set. If today's date subdirectory does not exist, the comparison set SHALL be empty and every video SHALL receive `downloaded_today: false`.

This flag SHALL be present on `/latest-videos` only; `/subscriptions/{channel_id}/videos`, `/trending-videos`, and `/search-videos` SHALL NOT add it.

#### Scenario: File present in today's folder
- **WHEN** the video `title` sanitises to `"My Talk"` and today's folder contains a file `03_My Talk.mp3`
- **THEN** the corresponding video object in the response SHALL have `"downloaded_today": true`

#### Scenario: File present without sequence prefix
- **WHEN** the video title sanitises to `"My Talk"` and today's folder contains a file `My Talk.mp3` (no sequence prefix, e.g. legacy downloads)
- **THEN** the response SHALL still set `"downloaded_today": true`

#### Scenario: Highlight-prefixed title matches plain downloaded file
- **WHEN** the video title is `"【精華】My Talk"` (sanitised stem `"精華_My Talk"`) and today's folder contains a file `03_My Talk.mp3`
- **THEN** the response SHALL set `"downloaded_today": true`

#### Scenario: Plain title matches highlight-prefixed downloaded file
- **WHEN** the video title sanitises to `"My Talk"` and today's folder contains a file `02_精華_My Talk.mp3` (a previously downloaded highlight re-upload)
- **THEN** the response SHALL set `"downloaded_today": true`

#### Scenario: Mid-title 精華 is not stripped
- **WHEN** the video title sanitises to `"年度精華回顧"` and today's folder is empty
- **THEN** the response SHALL set `"downloaded_today": false` (only a leading `【精華】` marker is normalized, not an interior occurrence)

#### Scenario: No matching file in today's folder
- **WHEN** today's folder is empty, or contains only files whose stems (after stripping `^\d+_` and the leading highlight marker) do not equal the normalized sanitized title
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
