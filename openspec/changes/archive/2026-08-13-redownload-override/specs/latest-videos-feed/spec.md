# latest-videos-feed Specification (delta)

<!-- 註：本 delta 沿用 openspec/specs/latest-videos-feed/spec.md 既有的英文撰寫慣例，
     以免合併後同一份 spec 出現中英夾雜。新建的 redownload-override capability 則為繁中。 -->

## MODIFIED Requirements

### Requirement: Client-side pagination for latest videos feed
The latest-videos-feed view SHALL render the full result list one page at a time, with a fixed page size of 200 videos, to avoid rendering an unbounded number of cards at once. On a fresh load (or after "套用" re-fetches), the view SHALL display the first page only. A "載入更多" (load more) control SHALL append the next page of videos to the displayed list each time it is activated, preserving the order of the full list. When all videos are displayed, the "載入更多" control SHALL be hidden or disabled. Pagination is purely a display concern: it SHALL operate on the single already-fetched result list and SHALL NOT trigger additional `GET /latest-videos` requests.

#### Scenario: Initial load shows first page
- **WHEN** the feed loads a result list larger than one page (e.g. 480 videos with a page size of 200)
- **THEN** only the first page of videos (the 200 most recent) SHALL be rendered
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
- **WHEN** the full result set fits within a single page (count ≤ 200)
- **THEN** all videos SHALL be displayed and the "載入更多" control SHALL NOT be shown

#### Scenario: Typical result set fits in one page
- **WHEN** the feed loads 180 matching videos
- **THEN** all 180 SHALL be rendered without the user activating "載入更多"

### Requirement: Count badge reflects total matches without cap warning
The latest-videos-feed view SHALL display a count badge reporting the total number of videos in the full result set. The badge SHALL NOT display any "已達上限" (limit reached) warning or advise the user to shorten the time window, because the result set is no longer capped. When the displayed list is shorter than the full result set (pagination in progress), the view SHALL also indicate how many videos are currently shown relative to the total.

#### Scenario: Badge shows total count
- **WHEN** the feed has loaded 480 matching videos
- **THEN** the count badge SHALL report 480 (the full total), not a capped value

#### Scenario: No cap warning shown
- **WHEN** the result set contains 200 or more videos
- **THEN** the count badge SHALL NOT show any "已達上限" wording nor advise shortening the time window

#### Scenario: Shown-vs-total indication while paginating
- **WHEN** 200 of 480 videos are currently displayed
- **THEN** the view SHALL indicate that 200 of 480 videos are shown

#### Scenario: No shown-vs-total indication when fully displayed
- **WHEN** the full result set fits within one page and every video is displayed
- **THEN** the badge SHALL report the total only, without a shown-vs-total fragment

### Requirement: Disable selection of videos already downloaded
The latest-videos-feed view SHALL, by default, disable the download checkbox of any video whose `downloaded_on_disk` is `true`, in addition to the existing rule that disables checkboxes for videos already marked as downloaded in the session via the download store. The "✅ 已下載" badge SHALL be shown for videos meeting either of these conditions, regardless of whether the checkbox is currently disabled or has been re-enabled via the global "允許再次下載" override (see the `redownload-override` capability).

Both conditions SHALL feed the same override: when the global override is ON, a video flagged `downloaded_on_disk: true` SHALL become selectable exactly like a video flagged only by the session download store. The latest-videos-feed view SHALL NOT own the override state or its control; it consumes the shared application-level state.

#### Scenario: Disk match disables checkbox
- **WHEN** a video card is rendered, its `downloaded_on_disk` is `true`, and the global "允許再次下載" override is OFF
- **THEN** its checkbox SHALL be `disabled` and its title row SHALL show the "✅ 已下載" badge

#### Scenario: Disk match excludes from selection toggle
- **WHEN** the user clicks on the disabled checkbox of a video flagged `downloaded_on_disk: true` (with the override OFF)
- **THEN** no change SHALL occur in the download selection store

#### Scenario: Session-marked downloads still disable
- **WHEN** a video has `downloaded_on_disk: false` from the backend but `download.isDownloaded(video_id)` returns `true` (e.g. just completed in this session), and the override is OFF
- **THEN** the checkbox SHALL remain disabled and the badge SHALL remain visible

#### Scenario: Disk match becomes selectable under the global override
- **WHEN** a video has `downloaded_on_disk: true` and the global override is ON
- **THEN** its checkbox SHALL NOT be `disabled`
- **AND** its checkbox SHALL reflect only whether the video is currently in the download selection
- **AND** the "✅ 已下載" badge SHALL still be visible

## REMOVED Requirements

### Requirement: "Allow re-download" override toggle
**Reason**: 此覆寫能力已從最新影片頁的區域性控制提升為全域開關，適用於全部六個影片清單頁；繼續由 `latest-videos-feed` 定義會與其他清單頁的同名行為重複且互相矛盾。同時，「關閉開關時把已選的已下載影片移出選取清單」這項行為經評估後刻意廢除——全域開關屬權限旗標，收回權限不應回溯銷毀使用者刻意建立的選取。

**Migration**: 整條需求遷移至新的 `redownload-override` capability，並有下列行為變更：
- 控制項位置由最新影片頁的 filter-bar 改為首頁 header。
- 狀態由元件區域 `ref` 改為共用 store；切換清單頁 SHALL NOT 重置，僅重新載入應用程式才回到 OFF（原本每次 mount 都重置）。
- 開關由 ON 切回 OFF 時 SHALL NOT 再從選取清單移除任何影片（原 `Turning toggle OFF restores disabled state` 情境中的移除行為已廢除，僅保留恢復 `disabled` 的部分）。
- 適用範圍由最新影片頁擴大至全部六個清單頁。
