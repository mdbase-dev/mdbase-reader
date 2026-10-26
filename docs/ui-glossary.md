# UI terminology glossary

The table below has been applied to Reader and Markdown editor user-visible copy. Based on `PRODUCT.md`,
[Interface shell](interface-shell.md), [Annotation UX audit](annotation-ux-audit.md),
[Reader improvement audit](reader-improvement-audit.md), and current UI strings.
Historical audits describe earlier states; code establishes current behaviour.
References are inspection-time lines: **R/** = `apps/reader/src/`, **M/** =
`packages/markdown-editor/src/`. Stored types, APIs, filenames and citation syntax
are unchanged. The table prioritises ambiguity and safety before polish.

## Concepts

- **Source** — A library record, including its note, citation data and document references.
  Avoid generic “book” (`R/AnnotationOwnerActions.tsx:92`) or “chapter”
  (`R/AnnotationList.tsx:166`) for arbitrary sources. Use the source’s title when known.
- **Document** — The readable PDF, EPUB or saved web page associated with a source.
  Avoid generic “page” (`R/reader-command-list.ts:129`). Keep **page** for a PDF page
  or web page, **book** for an actual book, and **chapter** for a chapter source;
  these are meaningful distinctions, not synonyms to replace globally.
- **Annotation** — A saved highlight, area capture, source comment or bookmark.
  Avoid “annotation notes” (`R/SourceRemovalDialog.tsx:73`). Use this umbrella term
  when an operation affects every kind; never imply every annotation has a passage.
- **Highlight / area capture / bookmark** — Respectively, marked text, a captured PDF
  region, and a saved reading position.
  Avoid “Area” (produced by `R/annotation-kind.ts:3`), “Areas”
  (`R/LibraryAnnotationToolbar.tsx:224`) and “area annotation”
  (`R/AnnotationComposer.tsx:41`). Preserve existing Highlights and Bookmarks labels.
- **Comment** — Authored commentary attached to an annotation.
  Avoid unexplained “Comment” actions (`R/SelectionToolbar.tsx:195`);
  use **Comment on highlight** in the selection toolbar, matching
  `R/AnnotationComposer.tsx:41`. A locally scoped text-field label may remain Comment.
  Use **With comments** for the cross-kind filter, not “With commentary”
  (`R/AnnotationList.tsx:292`); it includes source comments too.
- **Source comment** — A standalone annotation about a source, without a selected passage.
  Avoid bare “Comment” for stored `note` (`R/annotation-kind.ts:3`) and “Comments on
  the source” (`R/AnnotationList.tsx:295`). Use **Add source comment** and **Save
  source comment**. This does not create or replace the source note.
- **Source note** — The source record’s user-authored Markdown body.
  Avoid “Literature note” (`R/InspectorPane.tsx:152`) and “Source literature note”
  (`R/SourceNoteEditor.tsx:112`). This deliberately changes dominant UI wording:
  `PRODUCT.md` uses source note, as do current failure/removal messages, and it
  describes the record relationship without assuming a literature-review workflow.
- **Sources sidebar** — Navigation through views and sources.
  Avoid “Library navigator” (`R/LibraryNavigator.tsx:69`) and “left sidebar”
  (`R/ReaderHeader.tsx:116`). Follow Interface shell; identify purpose, not position.
- **Notes panel** — The source-context panel containing Annotations, Source note and Citation.
  Avoid “right sidebar” (`R/ReaderHeader.tsx:161`).
  Keep **Notes**, explicitly named in Interface shell and `R/InspectorPane.tsx:110`;
  it is a container name, not another kind of note.
- **Library / collection** — Library is Reader’s browsing workspace; collection is the
  connected mdbase data boundary.
  Avoid using them interchangeably: `R/SourceRemovalDialog.tsx:72–73` correctly
  distinguishes removal from the library from files retained in the collection.
  Preserve that distinction in confirmations and connection copy.
- **Search and commands** — The palette for finding sources and running actions.
  Avoid bare “Search” (`R/ReaderHeader.tsx:146`) or “Commands” as competing names
  (Reader improvement audit). Prefer the existing accessible name
  (`R/ReaderHeader.tsx:141`), supported by the palette placeholder
  (`R/ReaderWorkspaceView.tsx:409`); retain Search for explicitly scoped search fields.
- **Open beside / open below** — Open another view of a source in a neighbouring pane.
  Avoid “Duplicate” (`R/reader-command-list.ts:172,179`): no source record is copied.
  Reserve **Move** for relocating an existing tab or changing an annotation’s source.
- **Annotation source** — The source record an annotation belongs to.
  Avoid “Owner”, “ownership”, “owned by” (`R/AnnotationOwnerActions.tsx:54,58`;
  `R/annotation-ownership.ts:54`). Label creation **Save to source**, saved cards
  **Source**, and reassignment **Move annotation to source**. Moving must not imply
  relocating the passage or existing note embeds; retain those warnings.
- **Passage / location** — The original text or position targeted inside a document.
  Avoid “passage anchor” (`R/annotation-navigation.ts:19`); say **link to a passage**.
  Keep revision-change and unsupported-location explanations distinct.
- **Citation / citation details / CSL-JSON** — Citation names the tab; citation details
  names its bibliographic fields; CSL-JSON names the precise advanced format.
  Avoid vague “metadata” for citation editing (`M/citation-card.ts:50`). “Citation
  panel” occurs only in an internal comment (`R/use-source-import.ts:140`), not a
  verified visible label. Keep CSL-JSON (`R/CitationEditor.tsx:93`), with explanatory
  help rather than disguising the format.
- **Citation key / field evidence** — The collection-local citation identifier and
  the evidence behind individual citation values.
  Avoid “Citekey” (`R/CitationStructuredEditor.tsx:68`) and “Field sources”
  (`R/CitationProvenance.tsx:23`), which overloads source. Say **Edit citation
  Markdown** when editing `[@key]`, not citation details (`M/citation-card.ts:65`).

## Conventions

- Sentence case for headings, buttons, tabs and accessible names; retain named
  surfaces, brands and formats: Sources, Notes, mdbase Reader, PDF, EPUB, CSL-JSON.
  Use curly apostrophes/quotation marks in prose, not in code or copied syntax.
- Use the single-character ellipsis **…** when an action needs further input or
  confirmation in a dialog/workflow; omit it on final confirmation buttons,
  immediate navigation, inline expansion and ordinary links. Busy labels also
  use …, but describe the actual operation, not an unspecified wait.
- **Add** brings a source into the library, whether by link, identifier or file.
  **Import** migrates an external library (Zotero/Readwise), not a single file.
  Keep **Add source…** distinct from **Import a library…**
  (`R/reader-app-commands.ts:23,30`); this difference is intentional.
  **Create** makes new records, such as chapter sources; keep the established
  entry point **Add chapters as sources…**, then **Create chapters** on confirmation.
  Use Adding…/Stop adding for single-source flows and Importing…/Stop import for migrations.
- **Remove** detaches an item from a list, relationship or library; **Delete** destroys
  the named record. Retain dominant **Remove source**, but always disclose that it
  deletes the source note, preserves files/annotations, breaks links and cannot be
  undone (`R/SourceRemovalDialog.tsx:72–80`). Do not soften annotation deletion to Remove.
- **Cancel** abandons an unconfirmed operation; **Close** dismisses a surface without
  promising to discard edits. **Discard changes** explicitly abandons a draft.
  Confirmation buttons name the outcome: Delete annotation, Remove source,
  Create chapters; not Yes, OK, Confirm or Delete?. Visible and accessible names
  must agree; tooltips may add context or a shortcut.

## Proposed changes

`{title}` denotes an existing runtime source title, not literal copy. Related
occurrences share a row; these are representative replacements, not a migration checklist.

| Current string                                                                                 | Proposed string                                                                                   | File:line                                                                                  |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Comment (selection action / tooltip)                                                           | Comment on highlight / Comment on highlight (C)                                                   | R/SelectionToolbar.tsx:194–195                                                             |
| Comment (source action)                                                                        | Add source comment                                                                                | R/AnnotationPanelActions.tsx:50                                                            |
| Comment (`note` type label)                                                                    | Source comment                                                                                    | R/annotation-kind.ts:3                                                                     |
| Comments on the source                                                                         | Source comments                                                                                   | R/AnnotationList.tsx:295                                                                   |
| Comments (type filter)                                                                         | Source comments                                                                                   | R/LibraryAnnotationToolbar.tsx:225                                                         |
| With commentary                                                                                | With comments                                                                                     | R/AnnotationList.tsx:292                                                                   |
| New comment                                                                                    | New source comment                                                                                | R/AnnotationPanelActions.tsx:119                                                           |
| Save comment                                                                                   | Save source comment                                                                               | R/AnnotationPanelActions.tsx:143                                                           |
| Owner / Annotation owner                                                                       | Save to source                                                                                    | R/AnnotationOwnerChooser.tsx:32–34                                                         |
| Owner:                                                                                         | Source:                                                                                           | R/AnnotationOwnerActions.tsx:54                                                            |
| Move annotation                                                                                | Move annotation to source                                                                         | R/AnnotationOwnerActions.tsx:62                                                            |
| Outside chapter range — still belongs to this chapter (on each card)                           | Outside the chapter’s pages (once, on the Notes group heading)                                    | R/annotation-groups.ts                                                                     |
| Saved position is outside this chapter or could not be verified. …                             | (none: the chapter opens at its start)                                                            | R/use-reading-resume.ts                                                                    |
| End of “{title}” — outside chapter / Start chapter                                             | You’ve left this chapter · Back to chapter · Continue in book (only after leaving)                | R/SourceReadingBoundary.tsx                                                                |
| {n}% of chapter                                                                                | Ch. {title} · {n}% (chip; menu: Go to chapter start, Continue in the book)                        | R/SourceReadingBoundary.tsx                                                                |
| Move to the book                                                                               | Move to {title}                                                                                   | R/AnnotationOwnerActions.tsx:92                                                            |
| Save annotation owned by “{title}”?                                                            | Save annotation to “{title}”?                                                                     | R/use-annotation-owner.ts:165                                                              |
| Owner chosen explicitly. Existing note embeds will not move.                                   | Source chosen. Existing note embeds will not move.                                                | R/use-annotation-owner.ts:122                                                              |
| Your ownership setting keeps new annotations on the book.                                      | Your annotation setting keeps new annotations on the book.                                        | R/annotation-ownership.ts:54                                                               |
| Chapter ranges overlap; choose an owner explicitly.                                            | Chapter ranges overlap; choose a source.                                                          | R/annotation-ownership.ts:75                                                               |
| The chosen owner no longer exists. Choose an owner again.                                      | The chosen source no longer exists. Choose another source.                                        | R/use-annotation-owner.ts:171                                                              |
| Delete? (confirmation)                                                                         | Delete highlight                                                                                  | R/SelectionToolbar.tsx:294                                                                 |
| Delete (confirmation)                                                                          | Delete annotation                                                                                 | R/AnnotationEditor.tsx:253                                                                 |
| annotation notes (removal warning)                                                             | annotations                                                                                       | R/SourceRemovalDialog.tsx:73                                                               |
| Confirm and create chapters                                                                    | Create chapters                                                                                   | R/SourcePartCreation.tsx:117                                                               |
| Confirm and create chapter                                                                     | Create chapter                                                                                    | R/SourceAddDialog.tsx:266                                                                  |
| Literature note                                                                                | Source note                                                                                       | R/InspectorPane.tsx:147,152,171; R/workspace-tab-display.ts:9; R/reader-command-list.ts:98 |
| Open literature note                                                                           | Open source note                                                                                  | R/reader-command-list.ts:217; R/WorkspacePaneSupport.tsx:74,121                            |
| Literature note / Open literature note beside                                                  | Source note / Open source note beside                                                             | R/DocumentContextualToolbar.tsx:114,121                                                    |
| Opening literature note…                                                                       | Opening source note…                                                                              | R/SourceNoteEditor.tsx:75,79,107                                                           |
| Source literature note                                                                         | Source note                                                                                       | R/SourceNoteEditor.tsx:112                                                                 |
| Add to literature note / In literature note                                                    | Insert into source note / In source note                                                          | R/AnnotationCard.tsx:240–241                                                               |
| Searches literature notes and annotation text, not PDF, EPUB or saved-page contents.           | Searches source notes and annotation text, not PDF, EPUB or saved-page contents.                  | R/LibraryTextSearch.tsx:97                                                                 |
| Library navigator                                                                              | Sources sidebar                                                                                   | R/LibraryNavigator.tsx:69                                                                  |
| Toggle left sidebar (label / tooltip / command)                                                | Toggle Sources sidebar                                                                            | R/ReaderHeader.tsx:116,118; R/reader-command-list.ts:137                                   |
| Toggle right sidebar (label / tooltip / command)                                               | Toggle Notes panel                                                                                | R/ReaderHeader.tsx:161,164; R/reader-command-list.ts:144                                   |
| Annotations, literature note and citation                                                      | Annotations, source note and citation                                                             | R/reader-command-list.ts:145                                                               |
| Search (header)                                                                                | Search and commands                                                                               | R/ReaderHeader.tsx:146                                                                     |
| Duplicate in new pane right                                                                    | Open beside                                                                                       | R/reader-command-list.ts:172                                                               |
| Duplicate in pane below                                                                        | Open below                                                                                        | R/reader-command-list.ts:179                                                               |
| Only the page, with the chrome out of the way                                                  | Read the document with interface controls hidden                                                  | R/reader-command-list.ts:129                                                               |
| Chapter / Filter annotations by chapter                                                        | Source / Filter annotations by source                                                             | R/AnnotationList.tsx:166,168                                                               |
| All chapters and book                                                                          | All sources                                                                                       | R/AnnotationList.tsx:172                                                                   |
| This annotation has no supported passage anchor. Its text and original metadata are preserved. | This annotation has no supported link to a passage. Its text and original metadata are preserved. | R/annotation-navigation.ts:19                                                              |
| New area annotation / Save area                                                                | New area capture / Save area capture                                                              | R/AnnotationComposer.tsx:41,101                                                            |
| Area (`area` type label)                                                                       | Area capture                                                                                      | R/annotation-kind.ts:3                                                                     |
| Areas                                                                                          | Area captures                                                                                     | R/LibraryAnnotationToolbar.tsx:224                                                         |
| Add source (entry action)                                                                      | Add source…                                                                                       | R/NavigatorSections.tsx:126; R/LibraryWorkspace.tsx:524–525                                |
| Add a source (dialog heading)                                                                  | Add source                                                                                        | R/SourceAddDialog.tsx:100                                                                  |
| Add (link submission)                                                                          | Add source                                                                                        | R/SourceAddDialog.tsx:133                                                                  |
| Importing… (single-file flow)                                                                  | Adding…                                                                                           | R/SourceImportDialog.tsx:99                                                                |
| Stop import (single-file flow)                                                                 | Stop adding                                                                                       | R/SourceImportDialog.tsx:96                                                                |
| Add chapters to {title}…                                                                       | Add chapters as sources… — {title}                                                                | R/reader-app-commands.ts:104                                                               |
| Find book by container ISBN…                                                                   | Find book by ISBN                                                                                 | R/SourceAddDialog.tsx:304                                                                  |
| Citekey                                                                                        | Citation key                                                                                      | R/CitationStructuredEditor.tsx:68                                                          |
| Copy citekey                                                                                   | Copy citation key                                                                                 | R/LibraryRowMenu.tsx:98                                                                    |
| Reader could not generate a citekey.                                                           | Reader could not generate a citation key.                                                         | R/use-citation-editor.ts:371                                                               |
| citekey collision                                                                              | citation key conflict                                                                             | R/use-bibliography-export.ts:90                                                            |
| Open citation data                                                                             | Open citation details                                                                             | R/reader-command-list.ts:225                                                               |
| Field sources                                                                                  | Field evidence                                                                                    | R/CitationProvenance.tsx:23                                                                |
| Edit metadata                                                                                  | Edit citation details                                                                             | M/citation-card.ts:50                                                                      |
| Edit citation                                                                                  | Edit citation Markdown                                                                            | M/citation-card.ts:65                                                                      |
| CSL JSON citation metadata                                                                     | CSL-JSON citation details                                                                         | R/CitationEditor.tsx:141                                                                   |

**Product-owner choices accepted:** Source note replaces Literature note; Notes remains
the broader panel name; Remove source remains despite its destructive note deletion.
Other changes clarify existing distinctions.
