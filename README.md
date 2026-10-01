# mdbase reader

The first-party reading and annotation application for mdbase collections.

The repository is a pnpm workspace. Its architecture keeps the canonical source and annotation
model independent of React, mdbase Connect, document renderers, and native shells.

The web app opens mdbase Connect by default. It discovers and authorizes collections, reviews any
required Reader setup, queries sources and annotations through the exact Reader contracts, and
downloads readable files through Connect. Add `?preview=1` to open the explicitly labelled,
in-memory interface preview without creating collection records or files.

## Dockable workspace

Documents, library views, source tools, and the Sources sidebar share one Dockview workspace.
Drag a tab onto another tab strip to move it, or onto a pane edge to split. Both side panels
can be repositioned or tabbed with documents. Use a tab's context menu or a pane's **⋯** menu
for equivalent explicit actions; **F6** cycles groups. The command palette includes
**Reset pane arrangement**, which keeps all tabs open.

Layouts are saved per collection and old two-pane layouts migrate automatically. Moving panels
preserves document/editor identity; dirty closes require confirmation. Mobile shows one maximized
group while retaining the desktop arrangement. See [the architecture](docs/architecture/source-workspace.md)
for session, persistence, and renderer-lifetime boundaries, and [the interface shell](docs/interface-shell.md)
for the header, menus, command palette and stylesheet ownership.

## Deploy the development site

Publish a production build to the stable Cloudflare Pages development origin:

```sh
pnpm deploy:dev                         # lab (experimental default)
MDBASE_ENV=staging pnpm deploy:dev      # staging release rehearsal
```

This builds Reader with an HTTPS manifest for <https://lab.mdbase-reader.pages.dev>, validates the
manifest, restores the repository's generated manifest files, and uploads `apps/reader/dist` to the
`lab` branch of the `mdbase-reader` Pages project. The deployed app uses the lab Connect service and
the isolated lab connector at `http://127.0.0.1:28487`. Start that profile from the cloud-ops
checkout with `bin/mdbase-env lab desktop`, then sign in with a lab account. Staging remains an
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

## Browser extension

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/mdbase-reader/kimdfjefhbfgfecconmaiaaindjccidp)
for automatic updates. Stable `extension-v<version>` GitHub releases submit the production ZIP
for store review; prereleases stay GitHub-only. See [release setup and recovery](docs/extension-releases.md).
Unpacked development copies require manual rebuilding/reloading and do not receive store updates.

Build the unpacked Manifest V3 extension for one mdbase environment:

```sh
pnpm --filter @mdbase-reader/extension build                          # lab (default)
MDBASE_ENV=staging pnpm --filter @mdbase-reader/extension build       # staging
MDBASE_ENV=production pnpm --filter @mdbase-reader/extension build    # production
```

Load `apps/extension/dist` as an unpacked extension in Chrome 123 or newer (reload it after
rebuilding). The build's Connect service, loopback connector, Reader origin and name suffix come
from Reader's deployment table; its only permanent host permission is that environment's Connect
API, which is required for SDK record and binary-file traffic and cannot read browsing pages.
For LAB, start the isolated desktop profile with `bin/mdbase-env lab desktop` from the cloud-ops
checkout; its connector uses `http://127.0.0.1:28487`. Reload the unpacked extension and
reauthorize it after switching environments.

The toolbar button (**Alt+Shift+S**), **Alt+Shift+H**, or right-click **Save highlight to mdbase
Reader** / **Add a note in mdbase Reader** opens Reader in Chrome's side panel for that tab. The
panel stays open while you read: each new text selection appears in it, so several passages can be
highlighted in a row, each with a colour, tags and an optional note. **Ctrl/⌘+Enter** saves. Choose
the destination collection (remembered), edit the title, optionally add tags and a source note,
then explicitly **Save source**. Opening the panel or changing collections never auto-saves.

Reader extracts the primary article with Mozilla Readability (including text inside open shadow
roots) and saves readable HTML plus a form-value-free DOM archive. PDFs open in Chrome's viewer are
saved as PDF sources, downloaded from the page itself so your own access applies. When a page
carries a DOI, Highwire `citation_*`, PRISM, Dublin Core or scholarly JSON-LD metadata, the panel
shows the citation it will store: the DOI registry's CSL record (fetched through doi.org content
negotiation; only the DOI is sent), otherwise the page's embedded tags, under an unused citekey.

Existing sources are found by a store-side URL query, not a library scan; URLs are compared
without tracking parameters, `www.`, AMP variants or trailing slashes. Unsaved text is kept in
`chrome.storage.session` per tab and page, so closing the panel does not lose it. Connect grants
live in `chrome.storage.local`, shared by the panel and the service worker.

**Connect** opens the SDK's device-code authorization flow. Extension fetches explicitly omit
portal cookies; the SDK's signed grants remain the authorization mechanism. Capture access uses
`activeTab`. Selection highlights are anchored to the saved reading copy: when a passage repeats,
the occurrence whose surrounding text agrees best is used only if it clearly wins; missing or
ambiguous passages never receive fabricated targets, and the comment stays in the panel for retry.

**Settings → Mark pages I've saved** is an explicit opt-in. It requests the optional
`https://*/*` host permission; the service worker then looks up each HTTPS page you load in the
selected collection, shows a badge (highlight count, or ✓) and draws the saved highlights with CSS
Highlights. Turning it off removes the permission. See
[extension capture improvements and validation](docs/extension-capture-improvements.md).

## Zotero migration exporter (experimental)

Build the Zotero 10.0.x plugin with:

```sh
pnpm --filter @mdbase-reader/zotero-exporter build
pnpm --filter @mdbase-reader/zotero-exporter test
```

Install `apps/zotero-exporter/dist/mdbase-reader-exporter-0.1.0.xpi` through
Zotero's **Tools → Plugins → Install Plugin From File…**, then choose
**Tools → Export for mdbase Reader…**. It exports a private migration bundle with
original files, native annotations, notes, CSL and collection membership. It does not
modify Zotero or create an mdbase collection. Reader's bundle importer is not shipped yet.
See [the plugin documentation](apps/zotero-exporter/README.md) for scope, verification,
known omissions and release status.

## Commands

```sh
pnpm install
pnpm check
pnpm build
pnpm dev
```

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
use **Add existing** to register `~/testvault/mdbase-reader` or another collection with that local
environment. Collections registered with the managed service do not automatically appear in this
isolated profile.

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

The web build is emitted by `apps/reader`. `apps/electron` contains a sandboxed Electron main
process and isolated preload bridge; set `MDBASE_READER_DEV_URL=http://127.0.0.1:5173` when running
it against Vite. `apps/capacitor` contains the shared Capacitor configuration and native platform
adapter. Generate the platform projects with `pnpm --filter @mdbase-reader/capacitor exec cap add
android` or `cap add ios` on a machine with the corresponding native SDK.

## Reading reliability and browser audits

Reader keeps recoverable local source-note drafts, offers explicit conflict review, and limits
resident document renderers to four.
Use the library's search scope selector to distinguish metadata, note text and loaded-document
text; suspended and unopened documents are not included in document search. Sidebar search uses
Ctrl/Cmd+Shift+F, leaving Ctrl/Cmd+F available to the reading surface.

See [the implementation and audit report](docs/reader-improvement-audit.md) for SDK compatibility,
remaining work and the repeatable `test:browser` scenario. Browser testing
uses disposable fixtures; it does not authorize or mutate real Connect collections.

Annotations support compact highlighting, native comment textareas with one-second autosave,
search/filter/order controls, and return-to-reading navigation. Pending annotation text and new
PDF crops stay in memory, not device drafts; a forced reload can lose unsaved work. New highlights
still require explicit creation. See [shared editing](docs/shared-editing.md) for the local versus
currently deployed behaviour, validation and remaining acceptance gaps.

## Dependency rule

Dependencies point inward: platform shells and renderers adapt the framework-free core. The core
must never import React, Connect, EmbedPDF, Readium, CodeMirror, Electron, or Capacitor.

- `core` owns identities, validation, use cases, and ports.
- `connect` is the only package that imports the mdbase Connect SDK.
- `reading-surface` defines renderer-neutral locations, selections, and capabilities.
- `renderer-pdf` adapts EmbedPDF capture and scroll plugins.
- `renderer-epub` adapts Readium locators and text selections.
- `markdown-editor`, `platform`, and `ui` are narrow adapters shared by the app shells.
- `apps/reader` composes those boundaries into the mdbase-styled source workspace.
