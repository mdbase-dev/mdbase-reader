# mdbase reader

The first-party reading and annotation application for mdbase collections.

The repository is a pnpm workspace. Its architecture keeps the canonical source and annotation
model independent of React, mdbase Connect, document renderers, and native shells.

The web app opens mdbase Connect by default. It discovers and authorizes collections, reviews any
required Reader setup, queries sources and annotations through the exact Reader contracts, and
downloads readable files through Connect. Add `?preview=1` to open the explicitly labelled,
in-memory interface preview without creating collection records or files.

## Deploy the development site

Publish a production build to the stable Cloudflare Pages development origin:

```sh
pnpm deploy:dev
```

This builds Reader with an HTTPS manifest for <https://mdbase-reader.pages.dev>, validates the
manifest, restores the repository's generated manifest files, and uploads `apps/reader/dist` to the
`mdbase-reader` Pages project. The deployed app uses the managed Connect service and therefore works
with the normal desktop connector and its registered collections. It does not use or modify an
`mdbase.dev` custom domain.

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

`SPEC.md` and `DATA_MODEL.md` are normative design inputs. The integrity check deliberately fails
if either document changes during implementation work.

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
