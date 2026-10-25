# Offline app shell

The production build uses `@mdbase-dev/sdk/offline-shell/build` to precache the
public app shell, scripts, lazy chunks, fonts and packaged WASM as one release.
A previously opened app can reload its shell without connectivity. This does
not grant collection access or make uncached files and remote services available
offline; collection recovery and sync remain the SDK's responsibility. The separate
[device-local text index](library-text-index.md) retains bounded extracted HTML
text, not file bytes, credentials or an offline collection mirror.

Updates do not reload open tabs. An incomplete deployment does not replace the
last successfully cached release. Shell caching never stores authentication or
collection API responses.

The Reader build verifies every public asset against the emitted precache SHA-256,
including unvisited lazy chunks, workers and WASM. `build:report` additionally
checks initial/workspace dependency boundaries. A local production-preview browser
audit reloads offline and opens unvisited lazy UI/renderers; see
[bundle splitting](reader-bundle-splitting.md) for commands and limits.

## Pages HTML redirect diagnostics

The eaa4e697 SDK precache deliberately fetches with `redirect: "error"`. Cloudflare Pages redirects
`/index.html` to `/` and `/404.html` to `/404`. Chrome can therefore log `net::ERR_FAILED` for the
HTML filenames during worker installation, including an installation triggered by page reload.
The SDK then retries exactly the known clean URL, verifies its bytes against the precache hash,
and caches the response under the original filename. It does not follow arbitrary redirects.
These initial failures alone are not a broken navigation fallback or a Reader error.

Reproduce against a local LAB build, without a LAB service or account:

```sh
pnpm --filter @mdbase-reader/app build:lab
node apps/reader/scripts/audit-pages-offline.mjs
```

The audit serves actual build bytes behind emulated Pages clean-URL redirects, loads the in-memory
preview in a fresh headless Playwright browser, checks active worker control and both cached HTML
responses (200), then checks online and offline reloads with no page errors. Both expected HTML
request failures reproduce while installation and offline reload succeed. The failed `/` request
reported during the offline phase is the SDK's network-first navigation falling back to cache.
No runtime change or vendored SDK patch is needed for these diagnostics. A rejected worker
installation, missing cached responses, or a non-working offline reload would be a separate issue;
this local check does not certify live Pages deployment state or offline collection access.
