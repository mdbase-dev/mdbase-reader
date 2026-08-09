# mdbase reader

The first-party reading and annotation application for mdbase collections.

The repository is a pnpm workspace. Its architecture keeps the canonical source and annotation
model independent of React, mdbase Connect, document renderers, and native shells.

The standalone development build opens an explicitly labelled, in-memory interface preview. It
does not create collection records or files. Production hosts construct `ReaderApp` with a
`ConnectWorkspaceGateway` backed by the exact Reader source and annotation contracts.

## Commands

```sh
pnpm install
pnpm check
pnpm build
pnpm dev
```

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
