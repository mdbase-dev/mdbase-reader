# Collection file layout

Status: in progress on `feat/citation-claims`. Slice 1 (the naming module), the create
follow-through from slice 5, and slice 2 (path allocation for source notes and chapters)
are implemented. Annotations, files and Tidy are not. Proposed at `917da34`.

## Direction (agreed)

- Paths are for people and IDs are for the app. IDs stay in frontmatter, and no code
  reads meaning out of a path.
- Annotations are grouped by source and named readably:
  `annotations/<source-stem>/p6-we-propose-adam.md`.
- Source files are named after their source: `files/reader/<source-stem>/<source-stem>.pdf`.
  Area captures go in the same folder.
- A name is chosen once, when the record is created. Changing a title never renames
  anything. Renaming is a separate, explicit "Tidy file names" action.
- Chapters and other source parts are ordinary sources: `sources/<title-slug>.md`. The
  `sources/parts/` folder goes away.

`<source-stem>` is the file name of the source note, without `.md`, at the moment the
child is created (see [Slugs](#3-slugs)).

## Today's writers

| What                        | Path                                                                                 | Written at                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Source note                 | `sources/<slug>.md`, then `sources/<slug>-<8 hex of id>.md`                          | `packages/core/src/application/source-import-values.ts:104-123`, tried in order by `packages/connect/src/source-imports.ts:177-198` |
| Chapter / part              | `sources/parts/src_<random key>.md`                                                  | `apps/reader/src/source-part-creation.ts:166-171`, `packages/connect/src/create-source-part.ts:94-118`                              |
| Annotation                  | `annotations/<ann_uuid>.md`                                                          | `packages/connect/src/annotation-repository.ts:195`                                                                                 |
| Source file                 | `files/reader/<src_id>/<safeFileStem(original)>.<ext>`                               | `packages/core/src/application/import-source-file.ts:168-177` (also `attachSourceFile`, `source-records.ts:64`)                     |
| Web capture                 | `files/reader/<src_id>/<host>.readable.html` and `<host>.archive.html`               | `packages/web-capture/src/web-capture.ts:117-121`                                                                                   |
| Area capture                | `files/annotation-<ann_id>.png`                                                      | `packages/core/src/application/create-annotation.ts:50-52`                                                                          |
| Readwise and Zotero imports | `sources/imports/<id>.md`, `annotations/imports/<id>.md`, `files/reader/imports/...` | `packages/migration/src/readwise-*.ts`, `zotero-records.ts:44,129,155`, `zotero.ts:121`                                             |

This table describes the writers when the proposal was made. Since slice 2, source notes
and chapters both take the full `sourceNotePaths` candidate list (§3), and chapters no
longer go in `sources/parts/`.

The browser extension has no path code of its own. `apps/extension/src/save-capture.ts:185,275`
calls core's `importSourceFile` and `createAnnotation`, so it writes the same paths and
picks up every change below automatically.

## 1. Renames and links

**Finding: an SDK rename or file move rewrites the links that point at it, in one
atomic entry.** It is safe to build Tidy on this. Reader does not expose it yet.

- SDK: `rename(target, to, { updateRefs })` defaults `updateRefs` to true
  (`@mdbase-dev/sdk` `dist/client.d.ts:561-567`). `files.move(f, to, { updateRefs })`
  is at `dist/files.d.ts:134-138`. `preflightRename(target, to)` is a dry run that
  returns `{ rewrites, broken }` (`client.d.ts:484-489`, `wire.d.ts:498-516`).
- Contract (`mdbase-next` `docs/contracts/intent.md` §3.5 lines 281-305, and the
  `file_move` rules at lines 453-460): `update_refs` produces a `put_record` for every
  referrer, written with format fidelity. The rename and its rewrites are **one atomic
  entry**. `from` must equal the current path, or the rename is rejected as `renamed`.
  A taken `to` is `path_conflict`. The old path key becomes an alias.
- What gets rewritten (`crates/core/src/links.rs:1-15,757-800`): every record whose
  link resolved to the moved record before the move, and would not resolve to it after.
  This covers body wikilinks and embeds (`[[x]]`, `![[annotations/...]]`), Markdown
  links, and bare paths in **declared link fields**. Syntax, the embed flag, the alias
  and the anchor are kept. Only the target text changes.
- Reader's declared link fields are `reader-source` `documents[].file` and
  `relations[].target` (`apps/reader/mdbase/types/reader-source.md:66-72`), and
  `reader-annotation` `source` and `document.file` (`reader-annotation.md:43-49`). So
  moving a PDF rewrites `documents[].file` on the book and on every chapter that shares
  it, and `document.file` on its annotations. Renaming a source rewrites each
  annotation's `source` link and each chapter's `part-of` target. Renaming an annotation
  rewrites `![[...]]` embeds in literature notes, and in other apps' records too.
- Aliases are **not** used when resolving links. They only serve API reads by the old
  path (`crates/replica/src/replica/client.rs:414-425`). So an old link is only fixed if
  the rename rewrites it.
- Limits: one entry is at most 1 MiB sealed (`log-entry.md:618`). A rename whose
  rewrites do not fit is rejected as `too_large` (`open-questions.md` Q12).
- Reader today: `ReaderConnectClient` has no `rename` or file `move`
  (`packages/connect/src/repository-client.ts:218-241`), and neither does the native
  adapter (`packages/connect/src/native/*`). The legacy `@mdbase-dev/connect`
  beta.125 client has `rename({ updateRefs })` and `preflightRename`, but its
  `files.move` takes **no** `updateRefs` (`dist/files.d.ts:49-53`).

**What Tidy would still have to handle itself:**

1. Add `rename`, `preflightRename` and `moveFile` (with `updateRefs`) to the native
   adapter. Offer Tidy only on native connections. On legacy, file moves would break
   `documents[].file`.
2. Keep each entry under the size limit. Batch renames per source, and split a batch in
   half when it comes back `too_large`.
3. Links the engine does not rewrite:
   - unresolved or ambiguous links (they stay broken; preflight lists them);
   - path text in frontmatter fields that are not declared as links. None exist in
     Reader today, and the citation-claims snapshots must stay ID-based to keep it that
     way;
   - anything outside the collection: browser bookmarks, external notes, exported zips.
4. Reader's own fallbacks that build `annotations/<id>` (listed in §2). They are wrong
   for any annotation that has moved.

Undo gives back the same targets, but not always the same bytes: a rewritten link takes
the shape the engine writes (`shape(to)`), which can differ from how the user first
spelled it.

## 2. Constraints

**No contract, type or query depends on these folders.**

- Reader's contracts (`apps/reader/mdbase/contracts/*.md`) and types
  (`apps/reader/mdbase/types/*.md`) declare no path settings: no `path_pattern`, no
  `collection.path.pattern`, no glob and no folder. The generated pack contains none
  either (`apps/reader/src/generated/mdbase-app.json`). The engine supports type path
  policy; Reader chooses not to use it (see [Explicit paths](#explicit-paths-not-type-path-policy)).
  Type membership comes from the `type:` field.
- Discovery works by type, ID and link, never by folder:
  - `recordPathById` uses `where id == …` (`packages/connect/src/repository-client.ts:151-186`);
  - annotations for a source use `types: ["reader-annotation"]` plus
    `linksTo("source", path)` (`packages/connect/src/annotation-query.ts:68-91`);
  - the annotation view uses `this.file.path` equality (`apps/reader/src/mdbase-annotation-views.ts:197`);
  - other `file.path ==` filters are exact paths taken from records.
- Other apps: mdbase Writer reads Reader records through `dev.mdbase.reader.*`
  contracts. Its `annotations/` and `sources/` paths appear only in tests, benchmarks and
  its demo backend (`mdbase-writer/apps/writer/scripts/*`, `src/backend/demo.ts:32`).
  Nothing in mdbase-editor or mdbase-obsidian refers to Reader folders.

**Every place that would need changing:**

| File:line                                                                                                                               | Assumption                                                                     | Change                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `packages/connect/src/annotation-repository.ts:195`                                                                                     | writes `annotations/<id>.md`                                                   | take the allocated path (slice 2)                                                                                     |
| `packages/core/src/application/create-annotation.ts:50-52,121`                                                                          | area image at `files/annotation-<id>.png`                                      | per-source folder, same stem as the annotation                                                                        |
| `packages/core/src/application/create-annotation.ts:169-176`                                                                            | `transclude.path` comes from the caller, before the path exists                | use `created.path` (no app passes `transclude` today)                                                                 |
| `packages/core/src/application/transclude-annotation.ts:20`                                                                             | `annotation.path ?? annotations/<id>.md`                                       | require `path`                                                                                                        |
| `apps/reader/src/insert-annotation-in-draft.ts:16`                                                                                      | same fallback                                                                  | require `path`                                                                                                        |
| `apps/reader/src/annotation-wiki-candidates.ts:25`                                                                                      | same fallback                                                                  | require `path`                                                                                                        |
| `apps/reader/src/use-annotation-transclusion.ts:60`                                                                                     | same fallback                                                                  | require `path`                                                                                                        |
| `apps/reader/src/build-source-export.ts:48`                                                                                             | same fallback, also used as the zip path                                       | require `path`                                                                                                        |
| `packages/core/src/application/materialize-source.ts:49-51`                                                                             | `annotations/<id>` and bare ID accepted as embed keys                          | match the real path and its basename (Obsidian short form) only                                                       |
| `packages/core/src/application/materialize-source.ts:68`                                                                                | a broken embed counts only under `annotations/`                                | report any unresolved note embed (no file extension)                                                                  |
| `packages/markdown-editor/src/annotation-widgets.ts:110`                                                                                | "Linked annotation is missing" only when the target starts with `annotations/` | "Linked note is missing" for any unresolved `![[…]]` without an extension; keep the generic message otherwise         |
| `apps/reader/src/source-part-creation.ts:171`                                                                                           | `sources/parts/<id>.md`                                                        | `sourceRecordPaths(title, …)` candidates                                                                              |
| `packages/connect/src/create-source-part.ts:94-118`                                                                                     | a retry reconciles at one fixed path                                           | try the candidates in order and reconcile each by ID, as `source-imports.ts:204-220` does                             |
| `packages/core/src/application/import-source-file.ts:177`, `source-records.ts:64`                                                       | folder is `<src_id>`                                                           | folder is `<source-stem>`                                                                                             |
| `packages/web-capture/src/web-capture.ts:117-121`                                                                                       | names come from the host name                                                  | `<stem>.html` and `<stem>.archive.html`                                                                               |
| `packages/connect/src/source-imports.ts:164-168`                                                                                        | orphan-upload recovery lists `files/reader`                                    | unchanged if `files/reader/` is kept (§6)                                                                             |
| `packages/connect/src/migration-target.ts:66`, `native/native-migration.ts:69`                                                          | lists `files/reader/imports`                                                   | `files/reader` once imports adopt the layout                                                                          |
| `packages/migration/src/{readwise-books,readwise-sources,readwise-annotations,zotero,zotero-records}.ts`                                | `*/imports/<id>`                                                               | new layout (slice 9). Keep `files/reader/imports/readwise-native-*.json`: it is an import artifact, not a source file |
| `packages/core/src/domain/annotation.ts:36`                                                                                             | `path?` is optional                                                            | required on persisted annotations. Unsaved drafts use a separate type                                                 |
| Fixtures: `apps/reader/src/preview.tsx`, `apps/reader/test-fixtures/*`, `apps/reader/scripts/audit-*.mjs`, `source-imports.fixtures.ts` | old layout                                                                     | update with each slice                                                                                                |

Prefix checks that do **not** need changing: `zotero-validation.ts:76,93` (bundle
layout, not collection layout) and `completions.ts:152` (ranking only).

## 3. Slugs

There is one pure module in core, `packages/core/src/domain/record-names.ts`. It reuses
and extends `sourceRecordPaths` (`source-import-values.ts:104-123`) and
`safeFileStem` (`:90-98`). Names are computed from structured fields (title, CSL,
`target.pdf.pageIndex`, the Readium locator, the quote, the body), never from
`locator.label` or from another path.

**`slug(text, maxCodePoints)`**

1. Apply `NFKC`, then lowercase with `toLowerCase()`. Not `toLocaleLowerCase()`: that
   gives different output on Turkish locales.
2. Drop `'` and `’`, and the characters the engine refuses as ignorable that sit
   inside a word (Hangul fillers, variation selectors, ZWJ, the soft hyphen, the word
   joiner, tags). The other ignorables (zero-width space, ZWNJ, bidi controls) are
   separators.
3. Replace each run of characters other than `\p{L}`, `\p{M}` and `\p{N}` with `-`.
   Adding `\p{M}` is a fix: today's regex breaks Devanagari, Thai and other scripts
   with combining marks. A mark is kept only after a kept letter or digit.
4. Trim `-` from both ends.
5. Truncate to `maxCodePoints`, and to at most **120 UTF-8 bytes**, by a fixed
   code-point rule rather than `Intl.Segmenter`, whose grapheme rules change between
   ICU versions. Never cut before a mark, a variation selector, a skin tone, ZWJ or
   ZWNJ; after a virama or ZWJ before a letter or pictograph; or inside a flag or a
   Hangul jamo syllable. Then trim a trailing `-`. The byte cap keeps names under
   eCryptfs's 143-byte limit and well under 255.
6. Emit NFC.

Unicode letters are kept and not transliterated: a Japanese title gives a Japanese file
name. The allowed characters already exclude everything Windows forbids
(`<>:"/\|?*`, control characters, a trailing dot or space), and a name can never start
with `.`.

**Reserved names.** A name the engine's `check_path` would refuse as a path segment
counts as taken and moves to the next candidate (`crates/core/src/paths.rs:689-839`).
For slugs that means a first dot-segment of `con`, `prn`, `aux`, `nul`, `conin$`,
`conout$`, `clock$`, `com0`-`com9`, `lpt0`-`lpt9`, or one of the last two with a
superscript digit. `isReservedName` also applies the engine's other segment rules
(ignorable and control characters, `~1` short names, `node_modules`, hidden names),
and a test checks generated names against a port of `check_path`. An empty slug also
moves to the next candidate.

**Case and normalization.** Output is lowercase NFC, so Reader never writes two names
that differ only in case. The engine compares path keys,
`NFC(casefold_full(NFC(path)))` (`crates/core/src/paths.rs:18-20`,
`unicode/mod.rs:47-61`). That catches collisions with user-made files such as `Adam.md`,
or `ß` against `ss`, on every replica, so macOS and Windows behave the same. Tidy's
planner keeps an approximate key (`NFC`, then each code point upper- and lowercased,
with `ı` and `ẞ` fixed up to match full case folding) to avoid proposing two targets
in one plan. The engine stays authoritative.

**Collision suffix.** `-<4 hex>` taken from the **end** of the record's own ID (the
random part, which also holds for UUIDv7). Examples: `p6-we-propose-adam-7c2e.md`,
`introduction-9f41.md`. A suffix based on the ID is the same every time the record is
retried, and different on two devices, which a counter (`-2`) is not. If even that is
taken (about 1 in 65,536), the next candidate uses 8 hex.

**Source note** `sources/<stem>.md`. Candidates, in order:

1. `slug(title, 60)`;
2. `slug(title, 48)-<slug(first author family, 16)>-<year>`, when the CSL has them;
3. `slug(title, 60)-<4 hex>`;
4. `-<8 hex>`;
5. `<src_id>` when nothing else is usable.

Candidate 2 is not special to chapters. It is what keeps the many `Introduction`
chapters readable.

**Annotation** `annotations/<source-stem>/<leaf>.md`. `<source-stem>` is the current
stem of the owning source's note: the chapter for a chapter annotation. A stem the
generator wrote (or the source's ID) is the folder as written, however long. A stem
the user renamed, such as `Adam (Kingma 2014)`, goes through `slug(…, 60)`. Folders
are not records, so the engine never refuses two sources one folder:
`sourceFolderNames` follows the folder with `-<4 hex>`, `-<8 hex>` of the source ID
and the ID, and the caller takes the first that no other source uses. The leaf is at
most 64 code points before the suffix:

| Kind                      | Leaf                                                           | Example                          |
| ------------------------- | -------------------------------------------------------------- | -------------------------------- |
| PDF highlight             | `p<pageIndex+1>-<words>`                                       | `p6-we-propose-adam-a-method`    |
| EPUB highlight            | `<words>`                                                      | `call-me-ishmael-some-years-ago` |
| HTML highlight            | `<words>`                                                      | `the-key-is-to-read-the`         |
| PDF bookmark              | `bookmark-p<n>`                                                | `bookmark-p9`                    |
| EPUB bookmark             | `bookmark-<slug(chapter title, 24)>`, else `bookmark-<pct>pct` | `bookmark-loomings`              |
| HTML bookmark             | `bookmark-<pct>pct`                                            | `bookmark-40pct`                 |
| Area capture              | `p<n>-area[-<note words>]`                                     | `p6-area`, `p6-area-loss-curves` |
| Source comment (no quote) | `note-<words of body>`, or `note`                              | `note-useful-for-onboarding`     |
| Unknown type              | `<slug(type, 16)>-<words>`                                     |                                  |

- `<words>` comes from `quote.exact` (or the body for notes). Take whole words until 6
  words or 40 code points, whichever comes first. Text without spaces (CJK, Thai) gets
  the first 16 characters with their marks (the same cutting rule as step 5).
- EPUB and HTML highlights get no locator token. Chapter titles are long, and percentages
  mean little in a file name. The source folder plus the quote is enough.
- Page numbers are not zero-padded. Finder, Explorer and Obsidian sort numbers naturally.

**Files** `files/reader/<source-stem>/`:

| Representation         | Name                                                    |
| ---------------------- | ------------------------------------------------------- |
| primary PDF or EPUB    | `<source-stem>.<ext>`                                   |
| web capture            | `<source-stem>.html`, plus `<source-stem>.archive.html` |
| alternative attachment | `<source-stem>-<slug(original stem, 32)>.<ext>`         |
| area capture           | `<annotation leaf>.png`                                 |

A file path that is taken falls back to `-<4 hex of the transfer ID>` before the
extension. A chapter that shares its book's file has no file of its own. A chapter with
a separately supplied PDF gets its own folder.

**Order at import.** Uploads come before the record, so the stem is decided first. Try
the record candidates against the local view. Upload files under the first stem that
is free for both the record and the folder. Then create the record at that stem. If the
record create still loses a race at submit, move to the next candidate and use the same
stem for any files not yet uploaded. Files already uploaded stay where they are: they
are named once.

## 4. Concurrency

**How the engine decides a create with a path** (`intent.md` §3.1 lines 150-152; the
table at 886-889):

- An explicit `path` whose key belongs to another record is `path_conflict`. This is
  checked at submit when the record is visible locally, and authoritatively at head.
- A create **without** a path takes its path from the type's
  `collection.path.pattern`. A taken path then gets the first free ` (n)` suffix at
  head, and is never rejected (`crates/core/src/plan/records.rs:400-430`,
  `paths.rs:41-71`).
- Records have no create-if-absent flag. `mustNotExist` exists only for resources
  (`client.d.ts:441-449`), and the native adapter refuses a conditional create
  (`native-client.ts:275-277`). An explicit path is already create-only. The catch is
  _when_ the refusal arrives.

**Two devices, offline, same name:**

1. Each device checks its own local view, sees the name free, and the optimistic
   create succeeds. Reader's native create waits `receiptWaitMs`, then returns the
   optimistic record as saved (`native-client.ts:520-570`). The recovery journal marks
   the create complete at that point (`packages/platform/src/reader-services.ts:41-52`).
2. Both devices sync. The first to reach head wins. The second is `pending → rejected`
   with `conflict/path_taken`, and **"the local view drops the mutation"**
   (`replica-client-api.md:569-573`).
3. Nothing in Reader watches for that. The second annotation disappears without a
   message.

Exposure when this was proposed: annotations, none (UUID names). Chapters, none (random
keys). **Source notes were already exposed**: two devices that save the same title
offline lose the second record, and that device's annotations then link to the other
device's source. The create follow-through below now covers source notes, and since
slice 2 it covers chapters too, which take readable names.
Files are not exposed: `native-files.ts:62-111` waits for `write.confirmed`, so a
taken file path fails while the import is still running, and the fallback can be tried
then.

A retry with the same `intent` resends the same mutation, and "the first attempt's
content wins" (`client.d.ts:181-187`). So each path candidate needs **its own intent**
(`<mutationId>:<n>`). After a `path_taken`, read the path back: if the record there has
our `id` field, it is our earlier attempt. `source-imports.ts:204-220` already does this.

**Proposal: create follow-through (slice 5).** This must ship before or together with
readable annotation names, because readable names are what make collisions possible.

- The journal (`StorageMutationJournal`; the extension uses the same platform service)
  keeps the full create payload: path candidates, frontmatter and body. It drops the
  entry only when the receipt is **confirmed**, not when the local save finishes.
- A reconciler runs at startup, on reconnect and on receipt pushes. For each entry in
  the journal: confirmed, delete it. Rejected `path_taken`, or unknown with no record
  carrying that `id`, re-create at the next candidate under a new intent. Any other
  rejection is shown in the existing failed-save UI.
- If no receipt exists any more (they are kept 24 hours or more), the payload is still
  in the journal, and checking for the `id` decides.
- The same reconciler covers source notes, which fixes today's exposure.

**Alternative, not recommended for now** (see also
[Explicit paths](#explicit-paths-not-type-path-policy)). A `collection.path.pattern` on
`reader-annotation` version 3 would let head choose the suffix, so a create is never
rejected. The cost:

- naming fields in every annotation's frontmatter, which is clutter and against
  "paths are for people";
- the engine's ` (2)` style suffix;
- a path chosen at head that can differ from the optimistic one;
- adapter work, because the native client refuses an intent without a path
  (`native-client.ts:286-288`).

Revisit if follow-through proves fragile.

## Explicit paths, not type path policy

**Decision: Reader names every record it creates with an explicit path.** The engine
also supports type path policy (`collection.path.pattern` on a type) and creates whose
path is derived from it at head. Reader evaluated these and does not use them for now:

- Reader links and embeds by path (`[[sources/…]]`, `![[annotations/…]]`,
  `documents[].file`), so it needs the path when it writes the record and its
  dependents, not after head has decided.
- Patterns substitute only raw top-level fields. Readable names would need a slug field
  in every record's frontmatter, which is clutter and against "paths are for people".
- Files have no type, so they need explicit paths whatever records do.

**Trade-off.** Derived paths would avoid `path_taken` refusals entirely: head picks a free
name and never rejects the create. Explicit paths instead rely on the candidate lists
(§3) and the create follow-through (§4) to move a refused create to its next name and
rewrite the links that point at it. Revisit this if Reader ever controls type path
policy for its own types and can derive paths without extra frontmatter fields.

## 5. Migration and Tidy

- **New records** use the new layout from slice 2 on.
- **Existing records** stay where they are. A collection can mix layouts. Everything
  keeps working because nothing reads folders.
- **Old-default compatibility.** No code should assume `annotations/<id>.md` once the
  fallbacks in §2 are removed. Every persisted annotation carries the path it was read
  at (`annotation-repository.ts:336-345`). Keep **no** legacy shim. The one behaviour
  worth keeping is that an embed of a legacy record still resolves, and it does,
  because the record really is at `annotations/<id>.md`.

**Tidy file names.** Available from the Library menu (whole collection) and from the
source row menu (one source). Native connections only. Requires a connection to the
collection, not just a local replica, so renames are decided at head right away.

1. **Plan** (writes nothing). For each source, including chapters, compute the target
   with the creation rules (§3), using **current** titles, quotes and locators. Files
   and annotations follow the source's target stem. Allocate within the plan by
   approximate path key. Skip a move when only the case differs (a respelling: churn,
   and risky on case-insensitive file systems). Skip records already at their target.
2. **Preview.** Group by source. Each row shows `old → new` and a checkbox. All rows are
   on by default. Call `preflightRename` or file preflight lazily, as each group is
   expanded, to show "N links in M notes will be updated" and any links that stay
   broken. Rewrites into another app's records are labelled with that type. Unchecked
   rows are remembered on this device, so the next Tidy does not offer them again.
3. **Apply.** Work source by source. Use `submit` with `file_move` ops first, then
   annotation renames, then the source rename. Every op has `updateRefs: true` and its
   `from`. Start at 50 ops per mutation and halve on `too_large`. A `renamed` or
   `path_taken` result skips that row and reports it. One source never blocks the
   others. Show progress, and allow cancelling between batches.
4. **Undo.** Before applying, store a manifest
   `{ tidyId, at, moves: [{ id, kind, from, to }] }` in IndexedDB, and offer it as a
   JSON download. "Undo last tidy" renames back, with `updateRefs`, every item still at
   its `to`. Items moved again or deleted since are skipped and listed. Old paths stay
   readable through aliases for API reads in the meantime. Undo restores link targets,
   not their exact spelling (§1).

## 6. Recommendations

**Name annotations by quote words, not by date.** The date is already in `created_at`.
Dozens of highlights made on the same day would all collide and fall back to suffixes.
A date says nothing in a file browser, in Obsidian's quick switcher or in a graph view.
Quote words say what the note is. The cost is that quote text appears in file names,
and so in OS search and backups. Titles already do that today, so it adds little. Dates
suit journals, not annotations.

**Keep `files/reader/`.** Do not use plain `files/<source>/`.

- In a collection shared with Writer, Journal or Obsidian, `files/<name>/` is shared
  ground. Obsidian users often keep `files/` or `attachments/` themselves. A source
  called "attachments" or "images" would land in, or collide with, someone else's
  folder.
- The namespace says who manages these files, so Tidy never has to move anything it
  does not own.
- Orphan-upload recovery and import recovery already list `files/reader`
  (`source-imports.ts:165`, `migration-target.ts:66`). They keep working unchanged.
- The cost is one extra folder level. The human part of the path, the source stem,
  stays readable.

## Example: before and after

The collection has an edited book with two chapters sharing its PDF, a PDF paper, a web
page and an EPUB.

**Before**

```
sources/
  the-handbook-of-learning.md
  adam-a-method-for-stochastic-optimization.md
  how-to-read-a-paper.md
  moby-dick-or-the-whale.md
  parts/
    src_5f0c2b7e-….md                 # chapter "Introduction"
    src_a81e9d40-….md                 # chapter "Optimization methods"
annotations/
  ann_0b6e…md  ann_3c11…md  ann_77d2…md  ann_8a90…md  ann_b4f1…md  ann_e203…md  …
files/
  annotation-ann_77d2….png             # area capture
  reader/
    src_1c3a…/the-handbook-of-learning.pdf
    src_9f42…/1412.6980v9.pdf
    src_d0e7…/example.com.readable.html
    src_d0e7…/example.com.archive.html
    src_4b19…/moby-dick.epub
```

**After** (new records, or after Tidy)

```
sources/
  the-handbook-of-learning.md
  introduction-smith-2019.md          # "introduction.md" was already taken
  optimization-methods.md
  adam-a-method-for-stochastic-optimization.md
  how-to-read-a-paper.md
  moby-dick-or-the-whale.md
annotations/
  introduction-smith-2019/
    p3-learning-is-the-process-of.md
  optimization-methods/
    p41-gradient-descent-takes-small-steps.md
    p44-area.md                        # area capture on a chapter
  adam-a-method-for-stochastic-optimization/
    p1-we-introduce-adam-an-algorithm.md
    p1-we-introduce-adam-an-algorithm-7c2e.md   # same words, second highlight
    p6-area-loss-curves.md
    bookmark-p9.md
  how-to-read-a-paper/
    the-key-is-to-read-the.md
    note-useful-for-onboarding.md      # source comment, no quote
  moby-dick-or-the-whale/
    call-me-ishmael-some-years-ago.md
    bookmark-loomings.md
files/
  reader/
    the-handbook-of-learning/
      the-handbook-of-learning.pdf     # chapters' documents[].file point here
    optimization-methods/
      p44-area.png
    adam-a-method-for-stochastic-optimization/
      adam-a-method-for-stochastic-optimization.pdf
      p6-area-loss-curves.png
    how-to-read-a-paper/
      how-to-read-a-paper.html
      how-to-read-a-paper.archive.html
    moby-dick-or-the-whale/
      moby-dick-or-the-whale.epub
```

## Implementation plan

Each slice is one reviewable PR and keeps the tests green.

1. **Naming module (core, pure).** `slug`, the candidate generators for sources,
   annotations and files, the reserved-name check and the ID suffix. Property tests
   cover Unicode (NFKC, combining marks, CJK), the byte cap, reserved names and case.
   `sourceRecordPaths` delegates to it. Gain the author-year candidate and `\p{M}`.
   No path a user can see changes, except names that used to break on combining marks.
2. **Path allocation in Connect.** A shared `createAtFirstFree(candidates, …)` with an
   intent per candidate and ID read-back. Apply it to chapters (drops `sources/parts/`)
   and source notes. Annotations stay on UUID names until slice 5 lands. Done: the
   create follow-through (`packages/connect/src/create-follow-through.ts`) already is
   that shared allocator, so source notes and chapters pass it the full
   `sourceNotePaths` list. The legacy `<slug>-<8 hex of id prefix>` fallback is gone.
3. **Files.** The per-source folder and source-named files. Web-capture names. Area
   captures move into the per-source folder. A fallback when a file path is taken. The
   journal records the chosen paths.
4. **Remove path defaults.** Make `Annotation.path` required. Remove the seven
   `annotations/<id>` fallbacks, the `materialize-source` aliases and the
   prefix-keyed "missing" message.
5. **Create follow-through.** Keep the journal until confirmed, and reconcile on
   startup, reconnect and receipt. Covers sources now; covers annotations from here on.
   **Then** switch annotation creation to readable names.
6. **Adapter: rename and move.** `rename`, `preflightRename` and `moveFile` with
   `updateRefs` on the native client. Contract tests run against the SDK testing
   replica, including that `documents[].file` and `![[…]]` are rewritten.
7. **Tidy: plan and preview.** The dry-run planner and preview UI, with nothing applied.
8. **Tidy: apply and undo.** Batching, progress, the manifest and undo.
9. **Imports.** Readwise and Zotero adopt the layout, with allocation within each
   import plan. Recovery lists `files/reader`.
10. **Fixtures and docs.** `preview.tsx`, the audit fixtures and scripts, and
    `docs/architecture/source-parts.md`.

## Risks

- **Silent loss of offline creates.** This is the main risk. Slice 5 is a hard
  prerequisite for readable annotation names, and it also fixes the source-note case
  that exists today.
- **A large Tidy.** Size limits (1 MiB per entry, 64 items or 4 MiB per batch), the
  cost of preflight in big collections, and partial completion. Mitigated by working
  per source, splitting batches, and keeping a resumable manifest.
- **Link fidelity.** Rewritten links take the engine's shape. Unresolved and ambiguous
  links are left alone, and preview shows them.
- **Other apps and tools.** Records in Writer and other apps are rewritten. Their
  in-memory path caches follow `record.renamed` changes. External bookmarks are not
  rewritten. API reads still resolve old paths through aliases.
- **File-backed replicas during Tidy.** Obsidian or Finder sees moves. Case-only
  renames are skipped. An editor that holds a file open can cause a hold. The existing
  hold UI covers it.
- **Divergent stems.** A source renamed by hand gives new annotations a folder that
  differs from older ones until Tidy runs. This is intended (names are chosen once).
- **Privacy.** Quote words appear in file names (§6).
