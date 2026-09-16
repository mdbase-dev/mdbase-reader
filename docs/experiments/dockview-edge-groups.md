# Edge-group sidebar experiment

## Historical decision

**Superseded by the [completed responsive integration](../responsive-workspace.md).**
The combined desktop/mobile implementation is deployed as
`ca73f7765cee-production-mu3t04ql`. The measurements and minimal patch below remain
historical evidence of the earlier, incomplete prototype.

The initial conclusion was: **do not adopt this prototype by itself.** Edge groups solve the desktop width redistribution
problem, but they are not a drop-in replacement for Reader's whole-workspace maximize
and mobile single-pane behaviour. The experiment was reverted from application code.

The requested active-annotation left stripe was removed independently. Selection keeps
its subtle background and visible actions, without the inset accent line. This follow-up
was initially undeployed against baseline `083c05701855-production-mu3mq3ht`;
it is now included in the completed integration's production deployment.

## What was compared

The same real Reader fixture at 1440×1000, using Dockview 8.3.1:

1. Open a document and the source inspector.
2. Repeatedly open a second document, split it right, and close it.
3. Hide and reopen the inspector.
4. Resize the navigator by 55px; reload.
5. Maximize/restore the document.
6. Switch to 390×844; open navigator and inspector separately; return to desktop.

The HTML iframe was marked and scrolled before the operations. Both variants retained
its identity and reading position through the desktop split/close sequence. Reload was
checked separately; it is not expected to retain a Window object.

The temporary patch creates left/right edge groups through public APIs, uses native
sizing and removal of empty groups, and allows the resulting JSON through the existing
reader parser for the experiment. It does **not** implement a production migration or
a separate mobile shell. No enterprise modules were installed or enabled.

## Measurements

Widths below are outer sidebar group widths, including the tab strip, not just the
sidebar's content. Each measurement waits for layout to settle.

| Operation                                  | Existing grid sidebars    | Edge-group prototype                           |
| ------------------------------------------ | ------------------------- | ---------------------------------------------- |
| Initial left / right widths                | 260 / 560px               | 260 / 340px                                    |
| After first split then close               | 480 / 480px               | 260 / 340px                                    |
| Navigator while inspector hidden           | 720px                     | 260px                                          |
| After inspector reopened                   | 720 / 240px               | 260 / 340px                                    |
| Resized navigator, before and after reload | 775px, preserved          | 315px, preserved                               |
| Document width after maximize              | 1440px; sidebars absent   | 785px; sidebars still present                  |
| Mobile reading                             | One 390px document        | Both sidebars and a constrained 180px document |
| Mobile navigator / inspector               | Each opens alone at 390px | Did not produce a single full-width pane       |

The unusually wide baseline inspector is a measured existing issue, not the intended
340px default. The prototype consistently maintained the intended desktop widths.

## Native API check

A separate, minimal fixture removes Reader's controllers and persistence from the
comparison. It contains two grid documents and a 260px left edge group.

- Maximizing a grid document expands it to **1180px**, hides the other grid document,
  but leaves the 260px edge group visible.
- Calling `maximize()` on the edge panel does nothing: there is no maximized group.
- The installed implementation explicitly limits group `maximize()` to grid locations.

These are shell semantics, not evidence that edge groups are inherently unusable.
At the time, Reader relied on maximizing _any_ group to implement mobile navigation, and
expected document maximize to hide the sidebars too. Both assumptions need to change
before adopting an edge shell. Auto-hide/peek is a separate enterprise feature; enabling
basic edge groups does not provide it.

Header placement also needs attention: left/right edge groups default to vertical tab
strips. The prototype's top-header override did not survive restore consistently. A full
integration must deliberately choose and restore the presentation rather than treating
it as equivalent to today's grid headers.

## What adoption would require

- Explicit whole-workspace focus behaviour using edge visibility as well as grid maximize.
- A mobile policy for displaying a sidebar alone, without squeezing the document or
  remounting dirty editors. Edge-panel maximize cannot supply this.
- Validated persistence and migration for existing layouts; the experimental parser
  relaxation is not sufficient to ship.
- Repeat the full drag/touch, close-guard, renderer identity and source-context acceptance
  suite against that implementation. The existing full suite passes on the retained
  grid implementation; this experiment does not establish edge-group acceptance.

That is a separate integration change, not a small sidebar API substitution. The desktop
benefit is now demonstrated, but adopting only that part would regress mobile users.

## Evidence and reproduction

- Baseline: `/tmp/reader-audit-5CgRql/`
- Edge prototype: `/tmp/reader-audit-22tb1B/`
- Final retained implementation, full browser regression including stripe assertion:
  `/tmp/reader-audit-87X0mI/`

The directories contain `result.json` and `sidebar-*.png` screenshots. Comparison mode
reports **individual acceptance flags** in `measurements.sidebars.acceptance`. A top-level
`passed` means the measurement run completed without unexpected browser errors, not that
all UX criteria passed. Baseline fails width stability; the edge prototype fails maximize
and mobile criteria.

```sh
pnpm --filter @mdbase-reader/app exec vite --host 127.0.0.1 --port 5193 --strictPort
READER_AUDIT_SIDEBARS_ONLY=1 pnpm --filter @mdbase-reader/app test:browser
```

`dockview-edge-groups.patch` preserves the minimal prototype against `083c057`. For a
future comparison, apply it **only in a disposable checkout**, run the same command, and
inspect the acceptance flags and screenshots. It is not a production-ready patch. The
vanilla API probe is included in both comparison runs and is available at the dev-only
`test-fixtures/dockview-edge-probe.html` entry point.

Validation of the retained implementation: workspace tests passed (Reader: 57 files,
160 tests, plus five deployment-script checks), Reader typechecking/build passed,
changed-script lint and changed-file formatting passed, and architecture/specification
checks passed. The standalone prototype also passed Reader typechecking before it was
reverted. Owned Vite/browser processes were stopped; the probe is absent from build output.

All tests use disposable fixtures and owned browsers. No authenticated collection was
used, no production data was changed, and no deployment was performed.
