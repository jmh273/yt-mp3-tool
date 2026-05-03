# Spec: Sidebar Layout

## Purpose

Defines the persistent two-column sidebar layout for the main page, where a fixed-width left pane holds the channel list and a flexible right pane displays video content. Covers channel selection behaviour, the Latest Videos shortcut button, and responsive collapse at narrow viewports.

## Requirements

### Requirement: Split-pane layout
The main page SHALL display a persistent two-column layout: a fixed-width left pane (260px) containing the channel list and a flexible right pane filling the remaining width displaying video content. Both panes SHALL scroll independently.

#### Scenario: Page loads with split layout
- **WHEN** an authenticated user navigates to the home page
- **THEN** the channel list SHALL be visible in the left pane and the right pane SHALL show a "請選擇頻道" placeholder

#### Scenario: Right pane does not scroll with left pane
- **WHEN** the user scrolls the channel list in the left pane
- **THEN** the right pane content position SHALL remain unchanged

### Requirement: Channel selection updates right pane
The system SHALL replace the right pane content with the selected channel's video list immediately upon the user clicking a channel in the left pane. No page navigation or accordion expand/collapse SHALL occur.

#### Scenario: User clicks a channel
- **WHEN** the user clicks a channel card in the left pane
- **THEN** the right pane SHALL display that channel's video list within 200ms (excluding network fetch time)

#### Scenario: Selected channel is visually highlighted
- **WHEN** a channel is selected
- **THEN** its card in the left pane SHALL have a distinct visual state (e.g., highlighted background) distinguishing it from unselected channels

#### Scenario: Clicking the same channel again keeps the right pane unchanged
- **WHEN** the user clicks the already-selected channel
- **THEN** the right pane content SHALL remain the same (no reload triggered)

### Requirement: Latest Videos button in left pane
The left pane SHALL contain a "最新影片" button above the channel list. Clicking it SHALL replace the right pane content with the latest-videos-feed view.

#### Scenario: User clicks Latest Videos button
- **WHEN** the user clicks the "最新影片" button
- **THEN** the right pane SHALL switch to the latest-videos-feed view and any channel selection highlight SHALL be cleared

### Requirement: Layout is responsive at narrow widths
At viewport widths below 768px the layout SHALL collapse to a single-column stacked view (channel list on top, content below).

#### Scenario: Viewport narrowed below 768px
- **WHEN** the viewport width is less than 768px
- **THEN** the two-column grid SHALL collapse to a single column with the channel list appearing above the video content area
