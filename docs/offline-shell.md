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
