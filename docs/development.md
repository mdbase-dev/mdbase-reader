# Developing mdbase Reader

For using Reader, start with the [README](../README.md). This guide covers local development,
packaging, deployment, and implementation boundaries.

## Getting started

Use Node.js 22.12 or newer within the Node 22 release line and pnpm 10.7.0.
From the repository root:

```sh
pnpm install
pnpm check
pnpm build
pnpm dev
```

The web build is emitted by `apps/reader`. Add `?preview=1` to open the explicitly labelled,
in-memory interface preview without creating collection records or files.

## Test a local collection

An application served over HTTP from localhost cannot use the managed
`https://connect.mdbase.dev` service. Use Connect's isolated local environment, which explicitly
accepts loopback application manifests.

From the sibling `mdbase-connect` checkout, start the local control plane:

```sh
cd ../mdbase-connect
# First use only: cp .env.example .env
pnpm dev:environment:up
```

In another terminal, launch Connect with an isolated development profile:

```sh
cd ../mdbase-connect
pnpm dev:desktop:fresh
```

Enter `http://127.0.0.1:8787` in the pairing screen, approve the computer in the local portal, then
use **Add existing** to register a disposable test collection with that local environment.
Collections registered with the managed service do not automatically appear in this isolated profile.

Start Reader from its own checkout:

```sh
pnpm dev
```

Open Reader with the local Connect server selected:

```text
http://127.0.0.1:5173/?server=http://127.0.0.1:8787
```

Reader preserves that server selection through the authorization callback. Loopback manifests are
never used outside explicit localhost development. If the collection has no Reader contracts yet,
Connect shows the exact type-pack changes and installs them only after approval.

`mdbase-connect-dev validate-manifest … --allow-local` only permits loopback URLs during static
manifest validation. The desktop application does not expose an `--allow-local` option. To test
against the managed service instead, deploy Reader at an HTTPS origin declared by its production
manifest.

## Deploy the development site

Publish a production build to the stable Cloudflare Pages development origin:

```sh
pnpm deploy:dev                         # lab (experimental default)
MDBASE_ENV=staging pnpm deploy:dev      # staging release rehearsal
```

This builds Reader with an HTTPS manifest for <https://lab.mdbase-reader.pages.dev>, validates the
manifest, restores the repository's generated manifest files, and uploads `apps/reader/dist` to the
`lab` branch of the `mdbase-reader` Pages project. The deployed app uses the lab Connect service and
the isolated lab connector at `http://127.0.0.1:28487`. Maintainers start that profile from the
private mdbase-cloud-ops checkout with `bin/mdbase-env lab desktop`, then sign in with a lab account. Staging remains an
explicit release-rehearsal target and production remains on its protected deployment command.

## Production deployment

The production site is <https://reader.mdbase.dev>, connected to
<https://connect.mdbase.dev>. Deploy staging, then production, with the
**Deploy Reader** workflow from `main`:

```sh
gh workflow run deploy-reader.yml --ref main -f target=staging
gh workflow run deploy-reader.yml --ref main -f target=production
```

It builds a clean checkout of `main`, requires CI to pass, deploys, and checks
that the served manifest declares the target origin. The `reader-staging`,
`reader-production` and `reader-lab` environments each need
`CLOUDFLARE_API_TOKEN` (Cloudflare Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`.
Without them, staging and production dispatches fail immediately and the
automatic lab deploy on `main` is skipped with a warning.

When the workflow is unavailable, deploy from a clean checkout of `main` with
local Wrangler credentials:

```sh
MDBASE_ENV=staging pnpm deploy:dev
MDBASE_ENV=production pnpm deploy:prod
```

Staging builds use the separate `staging` Pages branch and
<https://staging.mdbase-reader.pages.dev>; only production targets `main`.
Conflicting environment selectors are rejected. Switching from the former staging-backed
site may require authorizing Reader against production; collection data is not migrated.

## Build the browser extension

Build the unpacked Manifest V3 extension for one mdbase environment:

```sh
pnpm --filter @mdbase-reader/extension build                          # lab (default)
MDBASE_ENV=staging pnpm --filter @mdbase-reader/extension build       # staging
MDBASE_ENV=production pnpm --filter @mdbase-reader/extension build    # production
```

Load `apps/extension/dist` as an unpacked extension in Chrome 123 or newer; reload it after
rebuilding. The build's Connect service, loopback connector, Reader origin and name suffix come
from Reader's deployment table. For LAB, maintainers start the isolated desktop profile
with `bin/mdbase-env lab desktop` from the private mdbase-cloud-ops checkout. Reload the unpacked extension and
reauthorize it after switching environments.

Package a production extension ZIP with:

```sh
MDBASE_ENV=production pnpm --filter @mdbase-reader/extension package
```

Its host permissions are that environment's Connect API (SDK record and binary-file traffic)
and `https://*/*`: the window's side panel follows the active tab and reads each page, and the
service worker marks saved pages. Where site access is limited, or on plain HTTP, the toolbar
button grants `activeTab` for that page. One Connect session serves the panel across tabs. Extension fetches explicitly omit portal cookies; the
SDK's signed grants remain the authorization mechanism. Connect grants live in
`chrome.storage.local`, shared by the panel and service worker. Unsaved capture drafts use
`chrome.storage.session` per tab and page.

Stable `extension-v<version>` GitHub releases submit the production ZIP for Chrome Web Store
review; prereleases remain GitHub-only. See [release setup and recovery](extension-releases.md)
and [extension capture improvements and validation](extension-capture-improvements.md).

## Build the Zotero exporter

```sh
pnpm --filter @mdbase-reader/zotero-exporter build
pnpm --filter @mdbase-reader/zotero-exporter test
```

Install `apps/zotero-exporter/dist/mdbase-reader-exporter-0.1.0.xpi` through
Zotero's **Tools → Plugins → Install Plugin From File…**, then choose
**Tools → Export for mdbase Reader…**. It exports a private migration bundle with
original files, native annotations, notes, CSL and collection membership. It does not
modify Zotero or create an mdbase collection.
See [the plugin documentation](../apps/zotero-exporter/README.md) for scope, verification,
known omissions and release status.

## Native shells

`apps/electron` contains a sandboxed Electron main process and isolated preload bridge;
set `MDBASE_READER_DEV_URL=http://127.0.0.1:5173` when running it against Vite.
`apps/capacitor` contains the shared Capacitor configuration and native platform adapter.
Generate the platform projects with `pnpm --filter @mdbase-reader/capacitor exec cap add android`
or `cap add ios` on a machine with the corresponding native SDK.

## Architecture and validation

The repository is a pnpm workspace. Its architecture keeps the canonical source and annotation
model independent of React, mdbase Connect, document renderers, and native shells.
Dependencies point inward: platform shells and renderers adapt the framework-free core. The core
must never import React, Connect, EmbedPDF, Readium, CodeMirror, Electron, or Capacitor.

- `core` owns identities, validation, use cases, and ports.
- `connect` is the only package that imports the mdbase Connect SDK.
- `reading-surface` defines renderer-neutral locations, selections, and capabilities.
- `renderer-pdf` adapts EmbedPDF capture and scroll plugins.
- `renderer-epub` adapts Readium locators and text selections.
- `markdown-editor`, `platform`, and `ui` are narrow adapters shared by the app shells.
- `apps/reader` composes those boundaries into the mdbase-styled source workspace.

Documents, library views, source tools, and sidebars share one Dockview workspace. Layouts are
saved per collection and old two-pane layouts migrate automatically. Moving panels preserves
document/editor identity; dirty closes require confirmation. Mobile shows one maximized group
while retaining the desktop arrangement. Reader limits resident document renderers to four.

Further implementation and validation notes:

- [Native SDK preparation](new-sdk.md): the separate read-only source/annotation
  foundation, artifact pin, and blocked shared session/setup/files integration.

- [Source workspace architecture](architecture/source-workspace.md): session, persistence, and
  renderer-lifetime boundaries.
- [Interface shell](interface-shell.md): header, menus, command palette, and stylesheet ownership.
- [Reader improvement audit](reader-improvement-audit.md): SDK compatibility, remaining work, and
  the repeatable `test:browser` scenario. Browser testing uses disposable fixtures; it does not
  authorize or mutate real Connect collections.
- [Shared editing](shared-editing.md): local versus deployed behaviour, validation, and remaining
  acceptance gaps.
