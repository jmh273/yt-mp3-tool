# video-stream-playback Specification

## Purpose

Provides in-app YouTube video playback via a centrally-managed modal. A single Pinia store coordinates which video (if any) is playing, and a single `VideoPlayerModal` mounted at the app root renders an embedded YouTube iframe. All video listing feeds open playback by clicking the card thumbnail, while the existing checkbox-based download selection behavior remains untouched.

## Requirements

### Requirement: Player store manages single playback state
The frontend SHALL provide a Pinia store `usePlayerStore` with:
- `currentVideoId: Ref<string | null>` — the YouTube video id being played, or `null` when closed
- `isOpen: ComputedRef<boolean>` — `true` iff `currentVideoId` is non-null
- `open(videoId: string): void` — sets `currentVideoId` to the given id
- `close(): void` — sets `currentVideoId` to `null`

#### Scenario: Initial state is closed
- **WHEN** the application loads
- **THEN** `currentVideoId` SHALL be `null` and `isOpen` SHALL be `false`

#### Scenario: open sets the video and marks open
- **WHEN** `open("abc123")` is called
- **THEN** `currentVideoId` SHALL be `"abc123"` and `isOpen` SHALL be `true`

#### Scenario: close clears the state
- **WHEN** `close()` is called
- **THEN** `currentVideoId` SHALL be `null` and `isOpen` SHALL be `false`

#### Scenario: Calling open with a new id while open replaces the playing video
- **WHEN** the store has `currentVideoId = "abc123"` and `open("xyz999")` is called
- **THEN** `currentVideoId` SHALL be `"xyz999"` and `isOpen` SHALL remain `true`

### Requirement: Video player modal renders YouTube iframe when open
The frontend SHALL provide a `VideoPlayerModal` component that, while `usePlayerStore.isOpen` is `true`, renders a modal containing a 16:9 `<iframe>` whose `src` is `https://www.youtube.com/embed/<currentVideoId>?autoplay=1&rel=0`. The iframe SHALL include `allowfullscreen` and `allow="autoplay; encrypted-media; picture-in-picture"`.

#### Scenario: Modal hidden when store is closed
- **WHEN** `currentVideoId` is `null`
- **THEN** the modal DOM SHALL NOT be rendered

#### Scenario: Modal renders iframe with correct src when opened
- **WHEN** `currentVideoId` is `"abc123"`
- **THEN** the modal SHALL render an `<iframe>` element whose `src` attribute equals `https://www.youtube.com/embed/abc123?autoplay=1&rel=0` and whose `allowfullscreen` attribute is present

#### Scenario: Switching video updates iframe src
- **WHEN** the modal is open with `currentVideoId = "abc123"` and the store is updated to `"xyz999"`
- **THEN** the iframe `src` SHALL update to `https://www.youtube.com/embed/xyz999?autoplay=1&rel=0`

### Requirement: Modal can be closed three ways
The `VideoPlayerModal` SHALL be closable by:
1. Pressing the **Escape** key
2. Clicking the **backdrop** area (outside the iframe content)
3. Clicking the **close button (×)** rendered inside the modal

#### Scenario: ESC key closes the modal
- **WHEN** the modal is open and the user presses Escape
- **THEN** `usePlayerStore.close()` SHALL be invoked and the modal SHALL no longer render

#### Scenario: Clicking backdrop closes the modal
- **WHEN** the modal is open and the user clicks the backdrop area (not the iframe content)
- **THEN** `usePlayerStore.close()` SHALL be invoked

#### Scenario: Clicking close button closes the modal
- **WHEN** the modal is open and the user clicks the close (×) button
- **THEN** `usePlayerStore.close()` SHALL be invoked

#### Scenario: Clicking on iframe content does not close the modal
- **WHEN** the modal is open and the user clicks within the iframe
- **THEN** `usePlayerStore.close()` SHALL NOT be invoked

### Requirement: Background scroll is locked while modal is open
While the modal is open, the document body SHALL have `overflow: hidden` applied. When the modal closes, the previous overflow value SHALL be restored.

#### Scenario: Body overflow locked on open
- **WHEN** the modal opens
- **THEN** `document.body.style.overflow` SHALL be set to `"hidden"`

#### Scenario: Body overflow restored on close
- **WHEN** the modal closes
- **THEN** `document.body.style.overflow` SHALL be restored to its prior value

### Requirement: Single modal instance mounted at app root
The application SHALL mount exactly one `<VideoPlayerModal />` instance at the root level (e.g., in `App.vue`). Individual feed components SHALL NOT mount their own modal instances.

#### Scenario: One modal in DOM at most
- **WHEN** the application is rendered with any feed view active
- **THEN** at most one `VideoPlayerModal` instance SHALL exist in the DOM

### Requirement: Feed cards trigger playback via thumbnail click
Every video listing feed (Trending, Latest, Channel, Search, URL Download) SHALL invoke `usePlayerStore.open(video.video_id)` when the user clicks the `<img class="thumb">` element of a video card. The thumbnail SHALL display `cursor: pointer` to indicate the affordance.

#### Scenario: Trending feed thumbnail click
- **WHEN** the user clicks the thumbnail of a card in `TrendingVideosFeed`
- **THEN** `usePlayerStore.open` SHALL be called with that video's `video_id`

#### Scenario: Latest videos feed thumbnail click
- **WHEN** the user clicks the thumbnail of a card in `LatestVideosFeed`
- **THEN** `usePlayerStore.open` SHALL be called with that video's `video_id`

#### Scenario: Channel videos thumbnail click
- **WHEN** the user clicks the thumbnail of a card in `ChannelVideos`
- **THEN** `usePlayerStore.open` SHALL be called with that video's `video_id`

#### Scenario: Search results thumbnail click
- **WHEN** the user clicks the thumbnail of a card in `SearchVideosFeed`
- **THEN** `usePlayerStore.open` SHALL be called with that video's `video_id`

#### Scenario: URL download thumbnail click
- **WHEN** the user clicks the thumbnail of a card in `UrlDownloadFeed`
- **THEN** `usePlayerStore.open` SHALL be called with that video's `video_id`

### Requirement: Checkbox selection behavior is preserved
Clicking the `<input class="video-checkbox">` SHALL continue to toggle the video's selection in the download store, exactly as before this change. The thumbnail click handler SHALL NOT be triggered by checkbox interactions.

#### Scenario: Checkbox click toggles download selection only
- **WHEN** the user clicks the checkbox on a video card
- **THEN** the video SHALL be toggled in the download store and the player modal SHALL NOT open

#### Scenario: Thumbnail click does not affect download selection
- **WHEN** the user clicks the thumbnail (img) of a video card
- **THEN** the player modal SHALL open and the download store selection SHALL remain unchanged
