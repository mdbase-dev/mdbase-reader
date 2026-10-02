# Private feedback integration (release-blocked)

This branch uses the shared `@mdbase-dev/ui/feedback` provider, form, screenshot
capture/markup and verification. It adds no email adapter, telemetry or storage.
The provider stays above connection/workspace lifetimes so cancelling or changing
views preserves the draft. Header entries remain available on desktop and mobile;
connection and document failures have a report entry.

Application metadata uses fixed connection/library/document identifiers, a bounded
build ID and deployment environment. Collection names and diagnostics require
explicit consent; source titles, IDs, paths, URLs, credentials and raw exceptions
are never passed to the feedback API. Only active source-open, renderer and
explicit connection/setup failures nudge the bug. Aborted/superseded operations
and background refreshes do not. Global capture-phase shortcuts ignore dialogs.

## Release dependency

Do not merge or deploy this branch until the UI package containing these exports
has been published through mdbase-connect's coordinated release process. The
currently pinned beta.123 does **not** contain them. Update all existing UI pins
and regenerate the lockfile from that actual published version, then run clean
install, full CI and the browser acceptance again. Local worktree links are used
only for isolated verification and are not committed as dependencies.

Deploy the v1/v2-compatible feedback Worker first via guarded cloud-ops. Approve
exact Reader origins in CORS and the separate Turnstile widgets before enabling
these build variables:

- `VITE_MDBASE_FEEDBACK_URL`: approved environment's `/v1/feedback` endpoint.
- `VITE_MDBASE_FEEDBACK_TURNSTILE_SITE_KEY`: that environment's public widget key.

Unset/invalid endpoints hide feedback. Existing deployment tooling supplies
`VITE_MDBASE_ENV` and `VITE_MDBASE_READER_BUILD_ID`; no implicit production endpoint
is selected. No production widget, secrets or deployment is changed here.

## Sample-data acceptance

Build with a loopback feedback URL and serve the output on loopback port 8891.
Run `node apps/reader/scripts/feedback-browser-test.mjs`; override the loopback
origin with `READER_FEEDBACK_TEST_ORIGIN`. It uses `?preview`, intercepts every
feedback POST, and checks desktop/mobile focus, draft restoration, explicit
capture cancellation, shortcut isolation, metadata and default consent. No
native chooser or real delivery is exercised; those remain separate acceptance.
