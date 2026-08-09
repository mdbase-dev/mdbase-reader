# mdbase reader

The first-party reading and annotation application for mdbase collections.

The repository is a pnpm workspace. Its architecture keeps the canonical source and annotation
model independent of React, mdbase Connect, document renderers, and native shells.

## Commands

```sh
pnpm install
pnpm check
pnpm build
pnpm dev
```

`SPEC.md` and `DATA_MODEL.md` are normative design inputs. The integrity check deliberately fails
if either document changes during implementation work.

## Dependency rule

Dependencies point inward: platform shells and renderers adapt the framework-free core. The core
must never import React, Connect, EmbedPDF, Readium, CodeMirror, Electron, or Capacitor.
