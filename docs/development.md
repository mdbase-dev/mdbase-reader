# Developing mdbase Reader

Start with the [README](../README.md) for using Reader. This guide covers the
workspace, local development, SDK pins, checks and environment builds.

## Install and develop

Use Node.js 22.12 or newer **within Node 22**, and pnpm 10.7.0, as declared in
`package.json`. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`dev` generates and validates the app manifest, packages the Zotero download,
then starts Vite at `http://127.0.0.1:5173`. It selects the committed LAB SDK and
a loopback Reader manifest. Add `?preview=1` for the labelled in-memory interface
preview, which does not create collection records or files.

For connected development, use an isolated LAB connector and test account;
localhost does not turn the production service into a development environment.
The LAB control plane and connector URLs live in
`apps/reader/scripts/deployment-environment.mjs`. Use the current environment
harness from the private mdbase-cloud-ops checkout to start that isolated profile.
Do not use a personal collection for browser fixtures. Reader preserves an
explicit `?server=` selection through authorization, but changing that URL does
not replace the SDK's packaged environment trust.

Manifest generation writes tracked files under `apps/reader/public/.well-known`
and `apps/reader/src/generated`. Before committing, restore the production
manifest with the default generator and inspect the diff:

```sh
pnpm --filter @mdbase-reader/app manifest
```

## Checks

The root scripts define the normal validation path:

```sh
pnpm lint
pnpm typecheck
pnpm test:workspaces
pnpm test:publisher
pnpm i18n:check
pnpm build
MDBASE_ENV=production pnpm --filter @mdbase-reader/extension package
```

`lint` includes ESLint, `format:check` and `check:architecture`. `pnpm test`
also runs architecture tests, publisher tests and workspace tests; `pnpm check`
combines lint, typechecking, tests and i18n validation. Publisher tests include
public provenance and original-archive authentication, so they need network
access and the npm Sigstore verifier. They do not deploy. Python 3 is required
for safe SDK archive inventory. On machines with `rpnpm`, use it for finite
checks and builds; keep dev servers and browser suites local.

The CI Chromium suites start their own loopback Vite server:

```sh
pnpm --filter @mdbase-reader/app test:html-svg
pnpm --filter @mdbase-reader/app test:pdf-touch
```

The full Reader audit uses an existing loopback server. In one terminal:

```sh
pnpm --filter @mdbase-reader/app exec vite --host 127.0.0.1 --port 5193 --strictPort
```

In another:

```sh
READER_AUDIT_ORIGIN=http://127.0.0.1:5193 pnpm --filter @mdbase-reader/app test:browser
READER_AUDIT_ORIGIN=http://127.0.0.1:5193 pnpm --filter @mdbase-reader/app test:a11y
READER_AUDIT_ORIGIN=http://127.0.0.1:5193 pnpm --filter @mdbase-reader/app test:polish
```

The full audit covers the virtualized library, persisted column layout,
source-note drafts and conflicts, document formats, annotations and docking.
The polish gates exercise desktop and phone layouts, themes, keyboard/focus
behavior and reduced motion. These use disposable fixtures; they do not prove
real-account or assistive-technology acceptance. Audits report their screenshot
and trace directories. Set `TMPDIR` to a workspace scratch directory to keep
those artifacts inside the checkout.

Feedback acceptance needs a build with its intercepted loopback endpoint, then
an existing preview server (the same setup used by CI):

```sh
pnpm --filter @mdbase-reader/app build:feedback-test
pnpm --filter @mdbase-reader/app exec vite preview --host 127.0.0.1 --port 8891 --strictPort
```

In another terminal:

```sh
READER_FEEDBACK_TEST_ORIGIN=http://127.0.0.1:8891 pnpm --filter @mdbase-reader/app test:feedback
```

Every feedback POST is intercepted; the gate does not deliver mail. It checks
viewport/theme/motion combinations, draft preservation and hiding the dialog
before screenshot capture.

## SDK pins and refreshes

Production uses an **exact npm version** of `@mdbase-dev/sdk`. The consuming
workspace manifests and `pnpm-lock.yaml` are the dependency pins. Its original
archive and `sdk-production-*.json` intake record live in
`packages/connect/vendor`; the intake records version, producer, digest and
packaged trust. `scripts/publisher/originals.mjs` selects the unique production
record matching the app's exact npm pin.

The production pin moves through cloud-ops' SDK repin automation, which opens or
updates `automation/sdk-repin`. It updates the scoped manifests, lockfile,
production archive/metadata and configured references. Reader's references
include `apps/reader/scripts/reader-sdk.mjs` and its test. Normal Reader CI and PR
review/merge policy still apply; a repin does not deploy. See
[SDK repins](sdk-repins.md) and the current app configuration and instructions in
mdbase-cloud-ops for automation ownership.

LAB and staging are separate, manually refreshed originals. Reader and the
extension install `@mdbase-dev/sdk-lab` and `@mdbase-dev/sdk-staging` through
`file:` dependencies alongside the production npm dependency. Their archive
paths are in `apps/reader/package.json` and `apps/extension/package.json`; their
intake metadata filenames are in `readerSdkPins` in
`apps/reader/scripts/reader-sdk.mjs`. The tests read that table rather than
hardcoding release filenames.

To refresh either original in a dedicated PR:

1. Obtain the unmodified target archive and its Sigstore bundle from the intended
   SDK producer's release. Authenticate its source, target and trust against the
   current publication policy; a successful build alone is not qualification.
2. Commit the archive, bundle and target intake JSON in `packages/connect/vendor`.
   Update both app manifests and the target metadata reference in `readerSdkPins`.
   Do not rewrite production pins or substitute another environment's trust.
3. Run `pnpm install` with the pinned pnpm version to update the lockfile. Inspect
   the diff and keep only changes required by the new originals.
4. Remove replaced files once no current pin, check or fixture uses them. Run the
   checks above and build the affected web and extension environments.

Vite verifies original archive hashes, installed members and packaged target
trust before importing SDK build code. It aliases the canonical public SDK
exports to the selected original, including transitive imports, and uses its
offline-shell build module. Unknown or conflicting selectors fail. Keep only
current dependencies and required fixtures in vendor directories; historical
originals are recoverable from git. The remaining legacy SDK alias is a separate
consumer and is not an environment fallback.

App CD independently authenticates the current production npm original and
fetches a matching staging original from that producer for its ephemeral
staging install. This does not refresh the committed LAB/staging aliases or
change trust roots. See [App CD](app-continuous-deployment.md).

## Build each environment

Root `pnpm build` checks i18n and builds the workspaces. With no environment
selector, SDK verification selects production. For explicit full builds:

```sh
MDBASE_ENV=production VITE_MDBASE_ENV=production pnpm build
MDBASE_ENV=lab VITE_MDBASE_ENV=lab MDBASE_READER_ORIGIN=https://lab.mdbase-reader.pages.dev pnpm build
MDBASE_ENV=staging VITE_MDBASE_ENV=staging MDBASE_READER_ORIGIN=https://staging.mdbase-reader.pages.dev pnpm build
```

`pnpm build:production` sets `MDBASE_ENV=production`; also set
`VITE_MDBASE_ENV=production` for a connected web build. The browser entry
requires that explicit Vite environment, even though archive selection defaults
to production. For only the LAB web
app, `pnpm --filter @mdbase-reader/app build:lab` supplies the SDK selector and
manifest origin. Web output is `apps/reader/dist`. Other targeted web builds:

```sh
MDBASE_ENV=production VITE_MDBASE_ENV=production pnpm --filter @mdbase-reader/app build
MDBASE_ENV=staging VITE_MDBASE_ENV=staging MDBASE_READER_ORIGIN=https://staging.mdbase-reader.pages.dev pnpm --filter @mdbase-reader/app build
```

Always pair the environment with its declared manifest origin. Setting only
`MDBASE_ENV` on a staging web build leaves the manifest's default production
origin. Environment builds regenerate tracked manifests; finish with production
manifest generation and inspect generated-file changes before committing.

## Deployments

`pnpm deploy:dev` invokes the **LAB-only** local Pages helper. It selects LAB's
manifest origin, SDK, Connect URLs and build revision, validates the output,
restores generated source manifests and uploads to the LAB Pages branch. It
requires Cloudflare credentials. An explicit staging or production target is
refused by that helper, including through the retained `deploy:prod` script.

Production web publication uses ops App CD: exact green main, authenticated
originals, staging smoke, production compatibility checks, then production
publication and smoke. See [App CD](app-continuous-deployment.md) for artifact
custody and recovery. Building locally does not publish.

## Browser extension and other shells

Build the unpacked Manifest V3 extension for one environment:

```sh
pnpm --filter @mdbase-reader/extension build
MDBASE_ENV=staging pnpm --filter @mdbase-reader/extension build
MDBASE_ENV=production pnpm --filter @mdbase-reader/extension build
MDBASE_ENV=production pnpm --filter @mdbase-reader/extension package
```

Extension `build` defaults to LAB; `package` defaults to production and emits a
ZIP under `apps/extension/release`. Load `apps/extension/dist` in Chrome 123 or
newer. Reload and reauthorize after changing environments. Environment URLs come
from Reader's deployment table. The independent extension App CD target and
Chrome Web Store review/release flow are described in
[extension releases](extension-releases.md).

Build and test the Zotero exporter with:

```sh
pnpm --filter @mdbase-reader/zotero-exporter build
pnpm --filter @mdbase-reader/zotero-exporter test
```

See its [README](../apps/zotero-exporter/README.md) for installation and export
scope. `apps/electron` contains the sandboxed main process and isolated preload;
`apps/capacitor` contains the native configuration and platform adapter.

## Architecture

Dependencies point inward toward the framework-free `core`. Renderers and
platform shells adapt its ports; collection access belongs in `connect`.
`reading-surface` defines renderer-neutral locations and capabilities.
`apps/reader` composes these packages into the source workspace. Run
`check:architecture` for the enforced dependency and source-size boundaries.

See [source workspace architecture](architecture/source-workspace.md),
[interface shell](interface-shell.md), and [shared editing](shared-editing.md)
for the relevant ownership and persistence contracts. [New SDK notes](new-sdk.md)
record historical migration evidence; they are not the current pin instructions.
