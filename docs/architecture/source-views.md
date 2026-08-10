# Source views: mdbase-backed library workspaces

Status: accepted and implemented

## Decision

Reader uses ordinary mdbase saved-view records as the durable definition of a
library view. A view can open as a first-class workspace tab, execute through
mdbase Connect, and render as a bibliographic table or card grid.

Reader no longer maintains a parallel saved-lens format in browser storage.
Temporary search, filter, sort, column, and presentation changes remain local
until the user explicitly chooses **Save changes** or **Save as view**.

## Ownership and authorization

The Reader manifest requests `full_collection` access, which is required for
saved-view discovery and execution. Source and annotation data continue to be
interpreted through their exact Reader contracts. Executed view rows are
resolved back to known Reader source paths; arbitrary collection rows never
become source records merely because a view returned them.

Reader-created views are ordinary `type: view` Markdown records. Their query
targets the seeded `reader-source` type, while presentation metadata records:

- table or card presentation;
- visible bibliographic columns;
- Reader field mappings;
- sort direction;
- editable filter state.

Presentation options carry `readerViewVersion: 1`. Reader may execute any valid
mdbase view, but it only overwrites views bearing that marker. An external view
can always be adapted with **Save as view**, preserving its original source.

## Runtime model

Connect owns saved-view discovery, execution, and source mutation:

- `listViews()` discovers view records and named views;
- `executeView()` returns ordered rows and selected values;
- `createViewSource()` and `updateViewSource()` persist explicit user saves.

The default **All sources** working view is not written to the collection. It
uses the already-loaded contract projection so the first library surface is
immediate. Saved views execute lazily when their workspace tab is hydrated.

Reader filters executed rows against its normalized source index by record path.
This preserves the application contract boundary while allowing mdbase to own
query semantics, persistence, grouping, ordering, and presentation metadata.

## Workspace relationship

Library views, documents, source notes, annotations, and citation metadata are
peer workspace tabs. They can be reordered, previewed, pinned, restored, moved
between panes, or split right/below. The left library region is therefore a
navigator and quick switcher, not the canonical library presentation.

This unifies the former inspector dock and document split concepts into one
pane system and leaves the reading surface dominant when supporting tools are
closed.
