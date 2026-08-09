# mdbase reader specification

Status: proposed v0.1
Date: 2026-08-09

## 1. Product definition

mdbase reader is a first-party reading, read-later, annotation, and research
application for mdbase collections. It reads PDFs, EPUBs, saved web pages, and
HTML documents; preserves the original files; records durable annotations and
literature notes; and supports citation workflows through CSL JSON and Pandoc
citation syntax.

The application is hosted at `reader.mdbase.dev`. The web application is the
canonical product. Capacitor packages it for mobile platforms and Electron
packages it for desktop platforms. Every distribution uses the same mdbase
Connect application identity, application contracts, and collection data
model, with separately declared redirect URIs and platform integrations.

mdbase reader is operated by mdbase, but it is not privileged. It receives no
collection content through an account-management session and cannot access a
collection merely because a user is signed in. It uses the public Connect SDK
to request an explicit, collection-scoped grant in the same way as an
independent application.

## 2. Product promise

> Read PDFs, EPUBs, and the web. Keep every source, citation, annotation, and
> note in a library you control.

Success means that a person can save a source, resume it on another device,
make a durable annotation, use that annotation in a Markdown note or another
authorized application, and export a valid citation without depending on
mdbase reader as the only usable copy of their library.

## 3. Users

The primary users are:

- people who save web articles and newsletters for later reading;
- researchers and students working with papers, books, and reports;
- Zotero, Obsidian, or Pandoc users who want portable literature notes;
- readers who annotate PDFs and EPUBs across desktop and mobile devices;
- people who want authorized AI tools to work with their research library;
- people who value inspectable files and application independence.

Users should understand libraries, documents, highlights, notes, tags, and
citations. They should not need to understand OAuth, collection contracts,
relay routing, selector algorithms, or CSL internals to begin reading.

## 4. Product principles

1. **Reading continuity comes first.** Opening a source should restore the
   correct representation and position without reorientation.
2. **The user's library outlives the application.** Canonical sources,
   annotations, notes, files, and citation data remain intelligible outside
   Reader.
3. **Capture preserves provenance.** Reader keeps the submitted URL, canonical
   URL, original or archived representation where permitted, and retrieval
   time.
4. **Annotations fail soft.** If an exact visual anchor cannot be restored, the
   selected quotation, note, provenance, and identity remain intact.
5. **Bibliographic rigour is available, not compulsory.** A casual saved page
   can be useful without complete citation metadata.
6. **User-authored prose is not an application-owned cache.** Reader preserves
   Markdown bodies verbatim except for explicit, revision-checked user actions.
7. **Application access remains explicit.** First-party operation never implies
   implicit collection access.
8. **Derived data is disposable.** Search indexes, parsed layouts, thumbnails,
   OCR caches, and embeddings are rebuildable and are not canonical knowledge.
9. **One product, several shells.** Web, Capacitor, and Electron builds share
   behavior and data; platform code exists only where the operating system
   provides a meaningful capability.
10. **Important operations are recoverable.** Imports, uploads, annotations,
    position changes, and destructive actions use revision checks, durable
    mutation recovery, or explicit reconciliation.

## 5. Product boundaries

### 5.1 Reader owns

- application navigation and library presentation;
- URL, PDF, EPUB, and HTML import workflows;
- reading and rendering experiences;
- annotation creation, editing, navigation, and re-anchoring;
- citation metadata editing and CSL JSON import/export;
- library search and Reader-owned derived indexes;
- current reading state and optional reading-history extensions;
- materialising annotation transclusions for portable export;
- platform integrations in the Capacitor and Electron shells;
- Reader's application manifest, contracts, starter types, and migrations.

### 5.2 mdbase Connect owns

- account identity and sign-in;
- choosing a collection and approving exact application access;
- collection authorization and grant lifecycle;
- local, relayed, or hosted routing;
- record and file operations;
- durable mutation outcomes and recovery;
- file transfer, stable file identity, moves, replacements, and deletion;
- hosted storage and local mirrors;
- application notifications and content-free signals.

### 5.3 The mdbase collection owns

- canonical source and annotation records;
- source-note Markdown bodies;
- stable file descriptors and links;
- original and captured documents;
- citation metadata;
- reading state;
- subscriptions when that extension is installed;
- accepted OCR, summaries, or other user-curated derivative works.

### 5.4 Outside the initial product

- social feeds, reactions, and public highlight networks;
- DRM circumvention or importing protected files without authorization;
- a mandatory FRBR Work/Expression/Manifestation hierarchy;
- full reference-manager parity with Zotero;
- collaborative real-time text editing;
- recommendation algorithms based on centrally collected reading behavior;
- text-to-speech as a launch requirement;
- RSS and newsletter ingestion as a launch requirement;
- a general-purpose writing or publishing environment;
- canonical AI embeddings or generated summaries that the user has not saved.

## 6. Application and deployment model

### 6.1 Web

The primary deployment is a progressive web application at
`https://reader.mdbase.dev`. It supports hosted and locally authoritative
collections through Connect, streams files through the authorized file API,
and stores only bounded offline state in browser-managed storage.

The web application must remain fully useful without installing a native
shell. Platform packaging cannot become a prerequisite for ordinary hosted
reading, annotation, citation, or export.

### 6.2 Capacitor

Capacitor builds provide:

- operating-system share-target ingestion where supported;
- native file picking and save/export destinations;
- secure credential and key storage through Connect adapters;
- deep links and authorization callback handling;
- background transfer within platform limits;
- push-notification delivery where declared and approved;
- offline caches sized and evicted according to device policy;
- screen, status-bar, keyboard, and safe-area integration.

The Capacitor shell must not introduce a second data store or a mobile-only
record format. Cached files and indexes are derived copies of collection data.

### 6.3 Electron

Electron builds provide:

- native file and folder selection;
- operating-system open-with and share integration;
- verified local file import and export;
- deep links and authorization callback handling;
- secure credential and key storage through Connect adapters;
- larger bounded offline caches;
- desktop menus, keyboard shortcuts, window restoration, and optional protocol
  registration.

Electron must use context isolation, a narrow validated IPC surface, no remote
module, and no renderer Node.js access. Untrusted HTML, EPUB content, and PDFs
must not receive Electron privileges.

### 6.4 Shared application core

All distributions share:

- the route and screen model;
- Connect session and collection behavior;
- schemas and contract projections;
- import planning and validation;
- source and annotation services;
- citation handling;
- renderer-independent selector and re-anchoring logic;
- derived-index interfaces;
- recovery and conflict presentation;
- accessibility behavior.

Platform adapters supply navigation, credential storage, file selection,
downloads, notifications, lifecycle, and cache capabilities. Business logic
must not branch directly on browser, Capacitor, or Electron globals.

## 7. Application identity and authorization

Reader publishes a signed application manifest at:

```text
https://reader.mdbase.dev/.well-known/mdbase-app.json
```

The initial application declaration requests only the operations necessary for
the selected user action. The anticipated capability groups are:

- describe and query compatible sources and annotations;
- read selected source records and their Markdown bodies;
- read attached files;
- create and update sources;
- create and update annotations;
- update source reading state;
- upload, move, replace, and download files;
- delete records or files only when the user invokes a destructive feature;
- register content-free refresh notifications where supported.

Reader must not describe granular privacy boundaries that Connect cannot
enforce. Library metadata views should use contract-scoped queries and
projections where possible, while opening a source or file uses the separately
authorized read operation.

Authorization begins in Reader:

1. The user chooses **Open a library** or begins a capture/import action.
2. Reader starts a Connect application session.
3. Connect offers compatible collections and a compatible starter collection.
4. The user chooses one collection and reviews exact requested actions.
5. Connect applies any reviewed starter contract/type setup atomically.
6. The browser or native shell returns to Reader's registered callback.
7. Reader opens the library or resumes the initiating action.

Reader supports more than one authorized collection. Collection identity must
remain present in application routes and native deep links so browser history,
window restoration, and callbacks cannot silently switch libraries.

## 8. First-run experience

When no compatible collection is available, Reader offers to create a hosted
**Reading** collection using its starter type pack. Creating a collection and
granting Reader access remain distinct reviewed consequences even when the UI
presents them as one continuous journey.

The initial empty state offers three actions:

- save a web page;
- upload a PDF or EPUB;
- import an existing library.

An example document may be offered as an explicit opt-in. Reader must not
silently add marketing or sample records to a user's library.

The first successful loop is:

```text
capture or upload
→ open the source
→ create an annotation
→ find that annotation in the source note
```

Citation enrichment is introduced when it provides value; it is not required
before the first document can be read.

## 9. Library

The library presents source records, not raw files. A source can have no file,
one primary representation, or several alternative and supplementary files.

The default library supports:

- inbox, queued, reading, finished, archived, and abandoned states;
- recent and continuing reading;
- search by title, creator, publication, tag, note text, and indexed document
  text where available;
- compact filtering and stable sorting;
- file-format, citation-completeness, and unresolved-annotation indicators;
- bulk tag, status, export, and safe deletion operations;
- clear online, cached, downloading, unavailable, and conflict states.

Library summaries should come from contract-scoped query projections and must
not require downloading every source body or document file.

## 10. Capture and import

### 10.1 URL capture

For an ordinary web URL, Reader:

1. records the submitted URL;
2. resolves the canonical URL without discarding the submitted value;
3. extracts title, creators, publication, date, language, description, and
   image candidates;
4. saves an immutable HTML archive where legally and technically permitted;
5. produces a stable normalized reading representation;
6. uploads the canonical representations;
7. creates one source record referring to their stable file identities;
8. offers reviewable CSL metadata when confidence is sufficient;
9. reports partial success and recovery when capture or upload is incomplete.

External content is untrusted. Capture must defend against server-side request
forgery, local-network targets, redirect abuse, oversized responses, content
type confusion, decompression bombs, malicious markup, and executable content.

### 10.2 File import

Reader accepts PDF, EPUB, HTML, and supported archive/export inputs. Import is
planned before mutation:

- determine media type from bytes as well as filename;
- hash the exact bytes;
- check for exact duplicates;
- extract provisional metadata;
- show conflicts with existing sources or files;
- upload with progress and cancellation;
- create the source only when required files are durably available, or record
  an explicit recoverable partial import.

Reader never claims to have imported a file while its mutation outcome is
unknown. It uses Connect's pending-mutation recovery rather than issuing a new
logical upload or create operation.

### 10.3 Library imports

Import adapters may support Zotero, Omnivore, Pocket, Karakeep, Pulp, CSL JSON,
BibTeX, RIS, and other reviewed formats. Each adapter produces a content-free
plan before applying changes, including:

- sources to create or match;
- files to attach;
- annotations to create;
- citation conflicts;
- duplicate and ambiguous records;
- unsupported data that will be preserved or omitted.

Imports preserve provenance and do not fabricate bibliographic certainty.

## 11. Reading experience

### 11.1 Shared behavior

Every reader provides:

- deterministic source and representation identity;
- resumable current position;
- table of contents or structural navigation where available;
- text search where extractable text exists;
- selectable text annotation;
- source-level notes and bookmarks;
- keyboard and touch navigation;
- zoom, font, theme, and layout preferences appropriate to the format;
- visible save, offline, and conflict state;
- accessible document and control semantics;
- opening an annotation in its best-known location.

### 11.2 PDF

PDF reading preserves the exact original bytes. Highlights store page identity,
PDF geometry, selected text, and recovery selectors according to
`DATA_MODEL.md`. OCR and extracted text are derived unless the user explicitly
accepts an edited representation into the collection.

PDF rendering must isolate scripts and embedded content. Reader does not
execute PDF JavaScript or launch attachments automatically.

### 11.3 EPUB

EPUB reading preserves the original EPUB and uses EPUB CFI for native
locations, with exact quotation and context for recovery. EPUB contents are
untrusted and rendered in a sandbox that blocks application privileges,
unapproved network navigation, and script access to Reader state.

### 11.4 HTML and normalized Markdown

Reader retains an immutable archive representation and a stable normalized
reading representation when possible. Annotations target the representation
actually read. Re-extraction cannot overwrite that target silently; it creates
a new representation or revision and initiates re-anchoring analysis.

## 12. Annotation behavior

Annotations are independent records. Supported initial motivations are:

- highlight;
- comment or note;
- bookmark;
- area or image selection.

Creating an annotation preserves:

- the source record;
- stable logical file identity;
- exact target file revision or content hash;
- human-readable locator;
- exact quotation and contextual quotation selectors where text exists;
- a defined text-position basis where one exists;
- the native PDF, EPUB, or HTML selector;
- creation and modification provenance;
- a readable Markdown body.

Reader may append an annotation transclusion to the source note only under an
explicit user policy. Creating the annotation and adding the transclusion must
be one revision-safe batch. Removing the transclusion does not delete the
annotation.

Re-anchoring follows the normative algorithm in `DATA_MODEL.md`. Reader never
silently replaces stored selectors. A proposed repair is either accepted
automatically under a documented exact-confidence rule or reviewed by the
user; uncertain matches remain visibly unresolved.

## 13. Literature notes and transclusion

The source record body is the user's literature note. Reader may provide
structured editing conveniences but must preserve arbitrary Markdown,
wikilinks, headings, lists, images, Pandoc citations, and annotation embeds.

The body is never regenerated wholesale from annotations. Reader actions that
insert, move, detach, or remove an embed operate on the exact reviewed revision
and preserve unrelated bytes wherever the record operation permits.

The native annotation embed is:

```markdown
![[annotations/ann_01K2A7Q1M8S6]]
```

Reader renders it as a rich annotation card. Obsidian can transclude it. A
materialiser resolves it into ordinary Markdown for Pandoc and generic tools.

## 14. Citations

A source may contain one complete CSL JSON item. CSL is optional until the user
needs formal citation behavior.

Reader supports:

- reviewable metadata extraction;
- CSL JSON validation and editing;
- citekey creation and collision handling;
- explicit reconciliation between friendly source metadata and CSL metadata;
- Pandoc citation insertion into Markdown;
- CSL JSON bibliography export;
- materialisation to Markdown and, through external or packaged converters,
  DOCX and PDF;
- visible failures for missing or invalid citation records.

`csl.id` is a durable citekey once referenced. Renaming a citekey is a distinct
collection-wide operation that discovers affected prose, updates it with
revision checks, and retains a former-ID alias for stale external references.

Reader must not silently rewrite user-edited CSL data when refreshing capture
metadata.

## 15. Search and derived processing

Reader may maintain local or managed derived indexes for:

- source metadata;
- source-note Markdown;
- annotation quotations and notes;
- extracted PDF, EPUB, and HTML text;
- optional OCR text;
- backlinks and citation references.

Indexes are scoped by collection and application authorization. They are
deleted when the corresponding local application data is cleared or the grant
is removed, subject to the documented platform lifecycle. Server-side indexing
requires an explicit application grant and may not be implied by account
ownership.

Search results identify whether text came from canonical Markdown, an original
file, or a derived extraction. A derived index is never the sole copy of a
user-authored note or accepted correction.

## 16. Offline behavior

Reader distinguishes:

- canonical collection state;
- authorized cached source records;
- cached document bytes;
- derived indexes and layouts;
- pending durable mutations.

Offline support is bounded by platform storage policy and user choices. A user
can mark sources or a library subset for offline reading where capacity allows.
Reader reports whether a document is fully available, partially transferred,
or requires the authority.

Offline edits retain base revisions. Reconnection reconciles through Connect
and surfaces conflicts; it does not apply last-write-wins to user prose.
Unknown mutation outcomes are recovered with the original request identity.

## 17. Interoperability

### 17.1 Plain files and Obsidian

Source and annotation records remain readable Markdown with YAML frontmatter.
Attached documents retain ordinary filenames. Obsidian can open notes, render
annotation transclusions, follow backlinks, and open supported attachments
without Reader.

An optional Obsidian integration may add exact-position opening and model-aware
editing, but the integration is not required for ownership or export.

### 17.2 Pandoc and CSL

Reader materialises mdbase/Obsidian transclusions into standard Markdown and
emits CSL JSON for cited sources. Pandoc citation syntax in authored prose is
preserved rather than converted to a proprietary token.

### 17.3 MCP and other applications

Reader's contracts are application-accessible through separately approved
Connect grants. An MCP client or another application may query sources,
annotations, and citation metadata without receiving Reader credentials or
implicit access to every collection.

Initial contract identities remain Reader-owned while the data model matures.
Promotion into a broader mdbase contract catalogue requires successful use by
at least one non-Reader consumer and an explicit compatibility review.

## 18. Security and privacy

- Reader requests the least collection access compatible with the current
  feature.
- Every collection is authorized separately.
- First-party hosting grants no implicit record or file access.
- Browser, EPUB, HTML, and PDF content is treated as untrusted.
- Native shells expose only validated, narrow platform bridges.
- Reader never logs document content, annotation text, citation data,
  authorization credentials, local paths, or uploaded file bytes.
- Telemetry is content-free and limited to product state, failure category,
  duration, sizes, and opaque trace identities.
- Local collection paths remain at the local connector.
- Derived caches are collection-scoped and clearable.
- Remote fetching rejects private and local network destinations unless a
  separately designed local capture component performs the request.
- Export and deletion remain available during the beta.

## 19. Accessibility

Reader targets WCAG 2.2 AA for application controls and reading surfaces.

Required behavior includes:

- complete keyboard access;
- visible focus state;
- semantic headings, landmarks, dialogs, and status announcements;
- non-color-only annotation and lifecycle states;
- adjustable typography and line spacing for reflowable content;
- dark, light, and high-contrast/e-ink-friendly themes;
- reduced-motion support;
- touch targets appropriate to mobile use;
- screen-reader-accessible annotation creation and navigation;
- zoom that does not obscure essential controls;
- graceful behavior for documents whose source accessibility is poor.

Reader must distinguish the accessibility of its controls from that of an
imported document and must not imply that an inaccessible source has been
remediated merely because the application shell is accessible.

## 20. Performance expectations

Initial performance budgets are product targets, measured on representative
release hardware and networks rather than guarantees:

- a warm library shell becomes interactive within 1 second on a contemporary
  desktop and within 2 seconds on a supported mid-range mobile device;
- metadata for the first library page does not require source bodies or files;
- a cached source opens at its saved position within 1 second where renderer
  initialization permits;
- long libraries use incremental queries and virtualized presentation;
- file downloads stream and report progress without buffering the entire file
  in JavaScript memory;
- PDF pages and EPUB chapters render incrementally;
- position writes are debounced and occur at meaningful boundaries;
- derived indexing is resumable and must not block reading;
- operations remain cancellable and observe one caller request budget.

Concrete budgets and fixtures should be added once representative libraries
and devices are selected.

## 21. Failure and recovery

Expected failures are presented as typed outcomes with recovery actions.
Reader must handle at least:

- authorization denied, expired, narrowed, paused, or revoked;
- collection unavailable or incompatible;
- invalid collection configuration or Reader type definitions;
- incomplete or unsupported source metadata;
- capture rejection or extraction failure;
- interrupted and resumable file transfer;
- storage quota exhaustion;
- revision conflict;
- unknown mutation outcome;
- selector mismatch or unresolved re-anchoring;
- citekey collision or broken citation;
- offline cache eviction;
- unsupported or malicious document content.

Errors remain attached to the initiating source, file, annotation, or export
operation. Retry never widens authorization or duplicates a logical mutation.

## 22. Destructive operations

Deleting a source, annotation, attached file, or collection is never inferred
from removing a transclusion or hiding an item.

Before source deletion, Reader reports:

- attached files;
- linked annotations;
- backlinks, embeds, and Pandoc citations;
- related subscription information;
- unresolved pending mutations.

The user can cancel, remove only the source, or explicitly select dependants.
No cascade is silent. File replacement with different bytes preserves the
logical file identity only when the user chose replacement; it creates a new
revision and triggers selector assessment.

## 23. Initial application contracts

The first contract family is incubating and owned by Reader:

```text
dev.mdbase.reader.source       1.0.0-beta.1
dev.mdbase.reader.annotation   1.0.0-beta.1
```

The starter type pack installs managed implementations named:

```text
reader-source
reader-annotation
```

The contracts describe normalized application-facing fields. The starter
types preserve the canonical Markdown representation in `DATA_MODEL.md`.
Contract evolution during beta must be explicit, reviewable, and migration
safe. Reader never silently rewrites a collection merely because a newer app
version exists.

Subscription, reading-session, creator, and shared-annotation contracts are
deferred extensions.

## 24. Launch scope

The first public Reader release is complete when a user can:

1. create or connect a compatible Reading collection;
2. save an ordinary web page;
3. upload and read a PDF;
4. upload and read an EPUB;
5. resume each supported representation on another session or device;
6. create, edit, find, and delete a text annotation;
7. create an area annotation in a PDF;
8. see an annotation represented as a durable Markdown record;
9. transclude an annotation into a source note;
10. add or import valid CSL metadata;
11. insert a Pandoc citation and export a CSL JSON bibliography;
12. search source metadata, notes, annotations, and available extracted text;
13. export original files and canonical Markdown;
14. recover an interrupted file or record mutation;
15. understand and resolve an ordinary revision conflict;
16. revoke Reader and retain a usable mdbase collection.

Native builds are release-ready when they pass the same functional contract
and their platform-specific import, export, deep-link, secure-storage, offline,
and update flows.

## 25. Acceptance criteria

### Data durability

- Renaming a source or file does not detach its annotations.
- Replacing file bytes never makes an old selector appear exact against the
  new revision.
- Editing a displayed quotation does not silently alter captured anchoring
  evidence.
- Removing an annotation embed does not delete the annotation.
- Deleting an annotation with inbound embeds requires an explicit decision.
- Invalid CSL and duplicate citekeys fail visibly.
- Export includes every cited valid CSL item and reports missing items.

### Authorization

- A signed-in account cannot open collection content without a Reader grant.
- Choosing one collection never exposes another.
- Narrowed grants disable only the affected features and explain recovery.
- Revocation prevents new Reader operations and leaves the collection usable.

### Cross-platform behavior

- Web, Capacitor, and Electron builds read and write the same records.
- A source opened on one platform resumes on another after synchronization.
- No platform stores canonical annotations only in local application storage.
- Native imports produce the same source and file descriptors as web imports.

### Outside Reader

- Source and annotation files remain understandable in a text editor.
- Obsidian renders annotation Markdown and ordinary transclusions.
- Original PDFs, EPUBs, and captured files can be exported intact.
- Materialised Markdown and CSL JSON work without Reader-specific runtime
  state.

## 26. Open design decisions

The following decisions should be resolved through implementation spikes and
fixtures rather than assumption:

- the exact canonical text projection used by `text_position` selectors;
- PDF coordinate interoperability between the chosen renderer and imported
  Zotero annotations;
- whether HTML normalized reading representations use Markdown, sanitized
  HTML, or both;
- browser versus managed capture responsibility and its security boundary;
- the offline storage budget and eviction policy on each platform;
- how much derived full-text indexing is device-local versus hosted;
- the initial citekey generation policy;
- whether accepted OCR is a source document, supplement, or extension record;
- the first import formats shipped beyond CSL JSON and Pulp;
- update distribution for Electron and Capacitor beta builds.

These decisions must not change the core source → file → annotation model.
