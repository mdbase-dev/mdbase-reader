# Private feedback integration

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

The integration now uses the published `@mdbase-dev/ui@0.1.0-beta.124`, which
contains the feedback exports and was published through the coordinated Connect
release. All workspace UI pins and the lockfile use that actual version. Verify
with a fresh frozen-lockfile install, full CI and the intercepted browser
acceptance; local worktree links are not release evidence.

Deploy the v1/v2-compatible feedback Worker first via guarded cloud-ops. Approve
exact Reader origins in CORS and the separate Turnstile widgets before enabling
these build variables:

- `VITE_MDBASE_FEEDBACK_URL`: approved environment's `/v1/feedback` endpoint.
- `VITE_MDBASE_FEEDBACK_TURNSTILE_SITE_KEY`: that environment's public widget key.

Unset/invalid endpoints hide feedback. Deployment workflows map the
environment-scoped public variables `MDBASE_FEEDBACK_URL` and
`MDBASE_FEEDBACK_TURNSTILE_SITE_KEY` to those build variables. Keep them unset
until the corresponding Worker CORS policy, widget hosts and live acceptance
are ready. Existing tooling supplies `VITE_MDBASE_ENV` and
`VITE_MDBASE_READER_BUILD_ID`; no implicit production endpoint is selected.

The existing deployment contract identifies the exact candidate origins:
`https://staging.mdbase-reader.pages.dev` (staging) and
`https://reader.mdbase.dev` (production). These are a configuration proposal, not
an assertion that CORS/widget-host approval or configuration has happened.
No production widget, secret or deployment is changed by this source PR.

## Sample-data acceptance

Build with a loopback feedback URL and serve the output on loopback port 8891.
Run `node apps/reader/scripts/feedback-browser-test.mjs`; override the loopback
origin with `READER_FEEDBACK_TEST_ORIGIN`. It uses `?preview`, intercepts every
feedback POST, and checks desktop/mobile focus, draft restoration, explicit
capture cancellation, shortcut isolation, metadata and default consent. No
native chooser or real delivery is exercised; those remain separate acceptance.
