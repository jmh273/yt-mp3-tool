## REMOVED Requirements

### Requirement: Step-based test API with Traditional Chinese narration
**Reason**: Superseded by the TypeScript Playwright equivalent in capability `playwright-feature-walkthrough` (same step API semantics, ported to TS).
**Migration**: Use the new TS `step(page, ctx, narration, action?, waitMs?)` helper exported from `frontend/e2e/helpers.ts`. Behavior is equivalent (action invoked, wait, screenshot, record).

### Requirement: Eleven test cases covering all user-visible features
**Reason**: Superseded by 17 cases in `playwright-feature-walkthrough`. The original 11 cases are preserved 1:1 (TC-01 ~ TC-11) with identical names and `min_steps`; an additional 6 cases (TC-12 ~ TC-17) cover features added since the original spec was written (trending pagination/view counts, search, URL download, video playback modal, download flow, quota counter).
**Migration**: Run `npm run e2e --prefix frontend` instead of `python ui-tests/feature_walkthrough.py`. The case structure is unchanged for TC-01 ~ TC-11.

### Requirement: Self-contained HTML report
**Reason**: Superseded by the equivalent requirement in `playwright-feature-walkthrough` with a different output path.
**Migration**: Output moved from `ui-tests/feature_walkthrough_report.html` to `frontend/e2e/report/walkthrough.html`. Visual style and structure are preserved.

### Requirement: Login precondition check before running
**Reason**: Superseded by the equivalent requirement in `playwright-feature-walkthrough`. The new version additionally checks for the storage state file.
**Migration**: Same `/auth/status` probe; new error messages cover the storageState case as well.

### Requirement: MP3 fixtures shipped in repo
**Reason**: Fixtures relocated as part of moving the walkthrough into the frontend tree.
**Migration**: `ui-tests/fixtures/loud.mp3` and `ui-tests/fixtures/quiet.mp3` are moved to `frontend/e2e/fixtures/loud.mp3` and `frontend/e2e/fixtures/quiet.mp3`. File contents and constraints unchanged.

### Requirement: Documentation updates pointing at the walkthrough
**Reason**: Superseded by the equivalent requirement in `playwright-feature-walkthrough`.
**Migration**: README.md and docs/DEPLOY.md now reference `npm run e2e --prefix frontend` instead of the Python script.
