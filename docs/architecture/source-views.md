# Source views: Reader library lenses, not mdbase saved views

Status: accepted for the initial Reader product

## Decision

Reader will model configurable library views as **library lenses** over the
Reader source contract. Native mdbase saved views will not power the default
library navigation or its saved filters.

A library lens is an application-domain value. It can combine:

- lifecycle states such as inbox, queued, reading, finished, archived, and
  abandoned;
- representation format and availability;
- creators, publications, tags, and free-text search;
- citation completeness and unresolved-annotation state;
- a stable sort and one Reader-owned presentation mode.

Built-in lenses and user-saved lenses share the same schema. User lenses are
stored as application preferences scoped by collection. The initial web
implementation may use local storage; native shells use their platform
preference adapter. Cross-device persistence requires an explicit future
product decision rather than silently adding a third collection contract.

## Why native mdbase saved views are not the default

Saved views are portable, collection-owned query resources intended to query
arbitrary record types and return open-ended selected values and presentation
identifiers. They are useful infrastructure, but their authorization and data
shape do not match Reader's default library:

1. Connect requires `full_collection` access for saved-view discovery and
   execution. Reader's specification deliberately limits ordinary library
   access to its source and annotation contracts.
2. A collection view may target manuscripts, tasks, projects, or any other
   record type. Reader currently promises special handling only for sources
   and annotations.
3. Saved-view result columns and renderer identifiers are open-ended. Treating
   them as Reader navigation would make arbitrary collection configuration part
   of the core source-list contract.
4. Application preferences and collection query resources have different
   ownership. Saving a compact Reader filter should not create or modify a
   shared collection artifact without an explicit user decision.

Requesting broader access merely to reuse view persistence would therefore
weaken least privilege and blur product boundaries.

## Query and performance model

The source repository remains contract-scoped and returns metadata projections
without source bodies or representation bytes. Reader renders the first page
immediately, then incrementally builds a metadata-only local index from later
pages. Lenses filter and sort that index. Collection change notifications
invalidate or update individual summaries.

This gives Reader:

- fast first interaction without downloading every source;
- deterministic filters over normalized source fields;
- one query path for built-in and user-defined lenses;
- virtualization for large result sets;
- explicit indexing progress when a whole-library count is not yet complete.

Search over note bodies and document text belongs to the derived search index,
not to the lens definition. A lens may reference a search term, but it must not
force bodies or files into the library metadata path.

## Domain boundary

The lens evaluator belongs in the application/core layer and is independent of
React, Connect, local storage, Capacitor, and Electron. Persistence and source
summary pagination are ports. UI components receive evaluated results and
indexing state; they do not interpret raw mdbase queries.

The first schema should be deliberately closed and versioned. Unknown fields
must be retained when possible but ignored safely. Predicates should be data,
not executable CEL supplied to the browser.

## Possible future bridge

Reader may later offer **Open an mdbase view** as a separate, explicitly
authorized feature. That bridge would:

- request `full_collection` access visibly;
- execute a chosen saved view without rewriting it;
- accept only rows that can be resolved to Reader source records;
- fall back to a generic table for unsupported presentation identifiers;
- never make arbitrary saved views part of the default library startup path.

This bridge is interoperability, not the implementation of Reader lenses.
