# mdbase reader data model

Status: proposed v0.3
Date: 2026-08-09
Companion: `SPEC.md`

## 1. Purpose

This document defines the canonical collection data used by mdbase reader. It
is normative for Reader-managed source and annotation records and informative
for deferred extensions.

The model combines:

- practical saving and reading of web pages, PDFs, EPUBs, and HTML;
- ordinary Markdown literature notes;
- independently addressable and transcludable annotations;
- stable logical file identity and exact revision anchoring;
- optional, complete CSL JSON citation data;
- Pandoc citation syntax in user-authored prose;
- selectors that retain meaning when a renderer or representation changes.

The model deliberately avoids a mandatory bibliographic Work → Edition →
Manifestation hierarchy. Its primary unit is a practical library source: the
particular article, webpage, newsletter issue, paper, book edition, video,
podcast episode, or document that a user saved and may cite.

## 2. Conformance language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
and **MAY** describe normative requirements.

A **record** is an mdbase Markdown record with YAML frontmatter and a Markdown
body. A **file** is a non-record collection file exposed through the Connect
file API. A **source** is one saved library item and its literature note. A
**representation** is a file through which the source can be read, viewed,
heard, or otherwise inspected. An **annotation** is an independently
addressable record attached to a source and optionally to an exact file
revision.

## 3. Design principles

1. **The source note is the centre of the model.** It is the practical library
   item and the user's freely editable literature note.
2. **Files are linked directly.** A PDF, EPUB, HTML capture, normalized reading
   document, image, or transcript does not require a wrapper record.
3. **Stable file identity and exact revision are distinct.** Connect `file_id`
   identifies the logical file across moves and replacements; a SHA-256
   revision identifies the exact bytes against which a selector was created.
4. **Annotations are records.** Each annotation is readable Markdown with
   stable identity, provenance, anchoring evidence, and an optional note.
5. **Quotation evidence is explicit.** The exact selected text is stored in
   the selector. A readable body blockquote presents it but is not the sole
   anchoring copy.
6. **Transclusion is curation, not ownership.** Removing an embed does not
   delete the embedded annotation.
7. **CSL is optional.** Every saved item is a source; formal bibliographic data
   is added when useful.
8. **Current personal reading state belongs to the source.** Detailed history,
   if introduced, uses extension records rather than an unbounded frontmatter
   array.
9. **Important data degrades gracefully.** A text editor should reveal what
   was saved, selected, written, and cited even when it cannot navigate to an
   exact visual target.
10. **Derived data is disposable.** Indexes, page renders, parsed DOMs,
    thumbnails, OCR caches, embeddings, and transfer bookkeeping are not
    canonical user data.
11. **Stable IDs, human filenames.** Record and file identity survives rename;
    filenames remain understandable.
12. **Standards are used at boundaries.** CSL JSON is used for citation data,
    Pandoc syntax for prose citations, and W3C Web Annotation concepts for
    portable selectors.

## 4. Contract status

The initial application contracts are Reader-owned and incubating:

```text
dev.mdbase.reader.source       1.0.0-beta.1
dev.mdbase.reader.annotation   1.0.0-beta.1
```

The starter type implementations are:

```text
reader-source
reader-annotation
```

Examples in this document use those implementation names in the `type` field.
A compatible collection MAY use different type names through an approved
contract mapping. Applications MUST query the contracts rather than assuming
the starter type names.

The contracts remain Reader-owned until at least one non-Reader consumer has
implemented them successfully and their application-neutral surface has been
reviewed explicitly.

## 5. Core entity graph

```text
Reader source / literature note
├── one or more direct file representations
├── optional complete CSL JSON item
├── optional current reading state
├── user-authored Markdown body
├── zero or more source relationships
└── zero or more annotation records
    ├── stable source link
    ├── stable logical file identity
    ├── exact target revision
    ├── portable quotation selectors
    ├── format-native selectors
    └── readable quotation and note body
```

Subscriptions, detailed reading sessions, creator records, shared annotation
sets, and publication graphs are deferred extensions. They MUST NOT be required
to interpret a v1 source or annotation.

## 6. Suggested collection layout

```text
reading/
├── mdbase.yaml
├── _types/
│   ├── reader-source.md
│   └── reader-annotation.md
├── sources/
│   ├── weil-gravity-and-grace.md
│   └── example-newsletter-the-power-of-words.md
├── annotations/
│   ├── ann_01K2A7Q1M8S6.md
│   └── ann_01K2A83ZV4J9.md
└── files/
    ├── gravity-and-grace.pdf
    ├── gravity-and-grace.epub
    ├── the-power-of-words.html
    └── the-power-of-words.readable.md
```

If `files/` contains normalized Markdown representations, collection
configuration MUST exclude those files from ordinary record discovery. They
remain file link targets and are not literature notes.

The paths above are defaults, not identity. A user MAY rename or reorganize
records and files. Reader MUST use mdbase rename and stable identities rather
than treating these folders as immutable database partitions.

## 7. Record identity and links

Every Reader-created durable record has an immutable generated `id`.
Recommended prefixes improve raw inspection:

| Record | Example |
| --- | --- |
| Source | `src_01K2A6Y4G7C8` |
| Annotation | `ann_01K2A7Q1M8S6` |
| Deferred subscription | `sub_01K2A80A9D3P` |
| Deferred reading session | `ses_01K2ABP7T4Q2` |

The starter types SHOULD generate ULIDs because they are stable, sortable,
easy to create offline, and supported by mdbase generated fields. UUIDv7 is an
acceptable compatible implementation.

The record `id`, not its path, is canonical identity. Human-authored links MAY
use readable paths. Machine-created links SHOULD use stable IDs with readable
aliases when the collection's link profile supports them:

```yaml
source: "[[src_01K2A6Y4G7C8|Gravity and Grace]]"
```

Reader MUST preserve valid user-authored link forms. It MUST NOT rewrite every
path link merely to impose its preferred representation.

## 8. Source record

### 8.1 Meaning

A source is one saved, readable library item and its literature note. It
normally corresponds to the item a user expects to cite as one unit.

Examples include:

- one journal article;
- one edition of a book;
- one independently cited chapter;
- one newsletter issue;
- one webpage or post;
- one uploaded report;
- one video or podcast episode;
- one email message.

Different editions or materially different versions are separate sources and
MAY be related. The model does not require an abstract Work record.

### 8.2 Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `type` | yes | Starter value `reader-source`; contract-mapped |
| `id` | yes | Stable record identity |
| `title` | yes | Friendly library title |
| `kind` | yes | Broad Reader classification |
| `authors` | no | Friendly display creator strings |
| `published` | no | ISO date, year, or datetime |
| `url` | no | Canonical external URL |
| `original_url` | no | Originally submitted URL when different |
| `description` | no | Extracted or user-edited description |
| `language` | no | BCP 47 language tag |
| `site` | no | Site or publication display information |
| `image` | no | Cover or preview file link |
| `saved_at` | yes | First saved datetime |
| `capture` | no | Capture provenance |
| `documents` | no | Direct file representation descriptors |
| `reading` | no | Current personal reading state |
| `tags` | no | User-owned tags |
| `relations` | no | Typed source links |
| `csl` | no | Complete, self-contained CSL JSON item |
| `former_citekeys` | no | Retained aliases after explicit citekey rename |

Recommended `kind` values are:

```text
article
book
chapter
paper
newsletter_issue
webpage
post
thread
video
podcast
email
document
unknown
```

`kind` is an extensible string vocabulary. A Reader version that encounters an
unknown value MUST retain it and SHOULD present an ordinary fallback rather
than treating the record as invalid solely because the value is unfamiliar.

### 8.3 Complete example

```markdown
---
type: reader-source
id: src_01K2A6Y4G7C8
title: Gravity and Grace
kind: book

authors:
  - Simone Weil
published: 2002
saved_at: 2026-08-09T14:21:00+10:00
language: en

documents:
  - file_id: 019c0000-0000-7000-8000-000000000101
    file: "[[files/gravity-and-grace.pdf]]"
    role: primary
    format: pdf
    media_type: application/pdf
    revision: sha256:19e81c...
    origin_url: https://publisher.example/gravity-and-grace.pdf
    retrieved_at: 2026-08-09T14:20:32+10:00
  - file_id: 019c0000-0000-7000-8000-000000000102
    file: "[[files/gravity-and-grace.epub]]"
    role: alternative
    format: epub
    media_type: application/epub+zip
    revision: sha256:7ca428...

reading:
  status: reading
  progress: 0.42
  document_file_id: 019c0000-0000-7000-8000-000000000102
  position:
    quote: The imagination is continually at work
    epub:
      cfi: "epubcfi(/6/14!/4/2/8:42)"
  started_at: 2026-08-09T14:22:00+10:00
  last_opened_at: 2026-08-09T15:21:00+10:00

tags:
  - simone-weil
  - thesis

csl:
  id: weil2002
  type: book
  title: Gravity and Grace
  author:
    - family: Weil
      given: Simone
  issued:
    date-parts:
      - [2002]
  publisher: Routledge
  ISBN: "9780415290012"
---

# Gravity and Grace

## Central concerns

My general account of the work goes here. The book repeatedly connects
attention, necessity, and the experience of the void.

## Important passages

![[annotations/ann_01K2A7Q1M8S6]]

This passage should be compared with [[bataille-inner-experience]].

## Questions

- Is decreation best understood as action, consent, or the withdrawal of action?
- Compare the discussion of attention with [@murdoch1970, pp. 33–34].
```

### 8.4 Body ownership

The source body is user-owned. It MAY contain:

- summaries, outlines, and arbitrary prose;
- headings, lists, tables, code, and quotations;
- annotation transclusions;
- links to concepts, people, projects, and other sources;
- Pandoc citations;
- images and attachments;
- no annotations or citations at all.

Reader MAY offer explicit actions that insert or transform body content. It
MUST NOT regenerate the body from annotations, overwrite unrelated prose, or
treat the body as a derived annotation dump.

## 9. Document representation descriptors

### 9.1 Direct files, no wrapper record

Representations attach directly to the source:

```yaml
documents:
  - file_id: 019c0000-0000-7000-8000-000000000101
    file: "[[files/example.pdf]]"
    role: primary
    format: pdf
    revision: sha256:...
  - file_id: 019c0000-0000-7000-8000-000000000102
    file: "[[files/example.epub]]"
    role: alternative
    format: epub
    revision: sha256:...
```

A PDF, EPUB, HTML archive, normalized Markdown file, audio file, video file,
image, or transcript does not require a `document.md` wrapper.

### 9.2 Stable identity and exact revision

`file_id` is the Connect immutable UUIDv7 file identity. It survives a file
move and a deliberate byte replacement. `file` is the readable collection link
or path. `revision` is SHA-256 over the exact current file bytes.

The three values serve different purposes:

| Value | Purpose |
| --- | --- |
| `file_id` | Identifies one logical file across moves and replacements |
| `file` | Keeps the collection readable and usable as ordinary files |
| `revision` | Binds selectors and review to exact bytes |

Reader-created descriptors MUST include all three after a file commit. A
manually authored descriptor MAY initially contain only `file`; Reader MAY
resolve and add `file_id` and `revision` through an explicit repair or adoption
operation. Reader MUST NOT create a durable annotation against an unresolved
file descriptor.

When the authority supplies MIME type, size, hash, upload time, and filename,
Reader need not duplicate them unless they carry semantic or export value.
Stored copies MUST NOT be treated as fresher than authority metadata.

### 9.3 Descriptor fields

| Field | Required | Meaning |
| --- | --- | --- |
| `file_id` | after commit | Stable logical Connect file identity |
| `file` | yes | Readable direct file link |
| `role` | yes | Semantic purpose within the source |
| `revision` | after commit | SHA-256 exact byte revision |
| `format` | no | Friendly format name |
| `media_type` | no | MIME type |
| `origin_url` | no | Remote origin of this representation |
| `retrieved_at` | no | Retrieval datetime |
| `derived_from_file_id` | no | Stable identity of a parent representation |
| `label` | no | Human label when role is insufficient |

Recommended roles are:

```text
primary
alternative
archive
readable
transcript
supplement
cover
attachment
```

Roles are extensible strings. Exactly one representation SHOULD be `primary`
when a source has readable files. More than one `primary` is invalid.

### 9.4 Web capture

Reader SHOULD preserve both the captured source and a stable normalized reading
representation:

```yaml
documents:
  - file_id: 019c0000-0000-7000-8000-000000000201
    file: "[[files/the-power-of-words.readable.md]]"
    role: primary
    format: markdown
    media_type: text/markdown
    revision: sha256:c1a77e...
    derived_from_file_id: 019c0000-0000-7000-8000-000000000202
  - file_id: 019c0000-0000-7000-8000-000000000202
    file: "[[files/the-power-of-words.html]]"
    role: archive
    format: html
    media_type: text/html
    revision: sha256:8d991a...
    origin_url: https://example.substack.com/p/the-power-of-words
    retrieved_at: 2026-08-09T15:03:00+10:00
```

A normalized representation used for reading and annotation MUST be stable.
Re-running extraction MUST NOT silently replace it. A materially changed
extraction is either:

- a new logical file with a new `file_id`;
- an explicit replacement retaining `file_id` with a new `revision` and a
  re-anchoring review;
- a derived cache that is not an annotation target.

## 10. Capture provenance

The optional `capture` object records how a source entered the library:

```yaml
capture:
  method: url
  application: dev.mdbase.reader
  captured_at: 2026-08-09T15:03:00+10:00
  submitted_url: https://example.substack.com/p/the-power-of-words?utm_source=email
  canonical_url: https://example.substack.com/p/the-power-of-words
```

Recommended methods are `url`, `upload`, `share`, `import`, `feed`, `email`, and
`manual`. The vocabulary is extensible.

Capture provenance MUST NOT contain credentials, authorization headers,
private local paths, or transient signed URLs.

## 11. Optional CSL JSON

### 11.1 Boundary

A source MAY contain one complete CSL JSON item under `csl`, represented as
YAML in frontmatter:

```yaml
csl:
  id: klein2026power
  type: post-weblog
  title: The Power of Words
  author:
    - family: Klein
      given: Ezra
  container-title: Example Newsletter
  issued:
    date-parts:
      - [2026, 7, 20]
  URL: https://example.substack.com/p/the-power-of-words
```

The object MUST validate as one CSL JSON item. Reader MUST preserve supported
CSL field names, capitalization, names, dates, arrays, and unknown extension
data needed for lossless round-tripping. Reader-specific capture, reading,
file, and relation fields remain outside `csl`.

### 11.2 Citekey

`csl.id` is the canonical Pandoc citekey:

```markdown
The argument depends on a distinction between concentration and attention
[@klein2026power, sec. "The Uses of Attention"].
```

It MUST be unique within the collection. Once the citekey appears in authored
prose or is exported, Reader MUST treat it as durable identity rather than an
ordinary editable label.

Changing it requires an explicit **Rename citekey** operation that:

1. checks uniqueness of the new value;
2. discovers known Pandoc references in canonical Markdown;
3. presents the affected records;
4. updates accepted references with revision checks in one batch where
   possible;
5. retains the previous value in `former_citekeys`;
6. reports stale, conflicted, or externally stored references.

```yaml
former_citekeys:
  - weilGravityGrace
```

Former citekeys are Reader metadata and MUST NOT be inserted into exported CSL
JSON as invented CSL fields. A materialiser MAY resolve them with a warning.

### 11.3 Friendly metadata and CSL duplication

The `csl` object is authoritative for citation output. Top-level `title`,
`authors`, `published`, `url`, and related fields are authoritative for Reader
library display and contract queries.

Initial capture MAY populate both from the same evidence. Reader MUST NOT
silently overwrite user-edited CSL when a friendly display field changes, or
overwrite a friendly field while refreshing citation metadata. The UI SHOULD
offer explicit operations:

- **Update citation metadata from source metadata**;
- **Update source metadata from citation metadata**;
- **Show differences**.

A casual saved item MAY omit CSL entirely. **Add citation metadata** creates and
validates the complete item.

## 12. Annotation record

### 12.1 Meaning

An annotation is an independently addressable Markdown record. It begins
attached to one source and MAY target one exact file revision. It can be linked
or transcluded from any number of notes without changing ownership.

Initial annotation types are:

```text
highlight
note
bookmark
area
```

The vocabulary is extensible. Unknown values MUST be retained.

### 12.2 Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `type` | yes | Starter value `reader-annotation`; contract-mapped |
| `id` | yes | Stable annotation identity |
| `source` | yes | Link to originating source |
| `document` | no | Stable logical file and exact revision |
| `annotation_type` | yes | Highlight, note, bookmark, area, or extension |
| `motivation` | no | Portable annotation motivation |
| `color` | no | Presentation colour or semantic palette value |
| `locator` | no | Human-readable location |
| `target` | no | Portable and format-native selector envelope |
| `tags` | no | Annotation-specific tags |
| `created_at` | yes | Creation datetime |
| `modified_at` | no | Last meaningful edit datetime |
| `created_by` | no | Application or actor provenance, not credentials |

`document` is absent for a source-level note. A file-targeted annotation MUST
identify the logical file and exact target revision:

```yaml
document:
  file_id: 019c0000-0000-7000-8000-000000000101
  file: "[[files/gravity-and-grace.pdf]]"
  revision: sha256:19e81c...
```

The source's `documents` array MUST contain the named `file_id` unless the
annotation is explicitly represented by a future external-target extension.

### 12.3 Text annotation example

```markdown
---
type: reader-annotation
id: ann_01K2A7Q1M8S6
source: "[[src_01K2A6Y4G7C8|Gravity and Grace]]"
document:
  file_id: 019c0000-0000-7000-8000-000000000101
  file: "[[files/gravity-and-grace.pdf]]"
  revision: sha256:19e81c...
annotation_type: highlight
motivation: commenting
color: yellow

locator:
  label: p. 16

target:
  quote:
    exact: >-
      The imagination is continually at work filling up all the fissures
      through which grace might pass.
    prefix: Our science is collective like our technics. Inheritance from
    suffix: This is one of the reasons why we avoid the void.
  text_position:
    basis:
      profile: mdbase.reader.text-v1
      hash: sha256:3fa1d2...
    unit: unicode_code_point
    start: 8231
    end: 8358
  pdf:
    page_index: 15
    coordinate_space:
      profile: pdf-default-user-space-v1
      box: crop
      origin: bottom_left
    quad_points:
      - [91.2, 238.1, 477.8, 238.1, 91.2, 201.4, 477.8, 201.4]

created_at: 2026-08-09T14:34:10+10:00
modified_at: 2026-08-09T14:38:02+10:00
created_by: dev.mdbase.reader
---

> The imagination is continually at work filling up all the fissures through
> which grace might pass.

This connects imagination with the avoidance of the void.
```

## 13. Annotation body profile

### 13.1 Text annotations

For a text highlight:

1. `target.quote.exact` is the canonical exact selected text used for
   re-anchoring and W3C export.
2. The first Markdown blockquote is the human-readable presentation of the
   selected text.
3. Everything after that blockquote is the user's note.
4. Reader SHOULD create the blockquote from `quote.exact` initially.
5. Reader MUST preserve the body verbatim except during an explicit edit.
6. Editing the body blockquote MUST NOT silently change `quote.exact`.
7. Editing `quote.exact` is an anchoring change and requires selector
   reassessment.

Reader SHOULD warn when the plain-text rendering of the blockquote materially
differs from `quote.exact`, but the mismatch does not destroy the annotation.
This intentional duplication keeps the record both machine-anchorable and
human-readable.

### 13.2 Source-level notes

A note about a whole source has no document or selector:

```markdown
---
type: reader-annotation
id: ann_01K2A83ZV4J9
source: "[[src_01K2A6Y4G7C8|Gravity and Grace]]"
annotation_type: note
motivation: commenting
created_at: 2026-08-09T15:01:00+10:00
---

The sequence of fragments is editorial rather than authorial. Avoid treating
their order as a continuous argument.
```

### 13.3 Bookmarks

A bookmark MAY have a document and native position but no quotation. Its body
is optional. Reader MUST NOT fabricate empty `quote.exact` values.

## 14. Selector envelope

### 14.1 General rules

`target` contains portable and format-specific anchoring evidence. An
implementation MUST treat native selectors as accelerators and exact quotation
as the principal cross-renderer recovery evidence for text annotations.

All selector coordinates and offsets are interpreted against the exact
`document.revision`. A different current file revision requires re-anchoring
assessment before Reader presents the target as exact.

### 14.2 Text quotation selector

```yaml
target:
  quote:
    exact: the exact selected text
    prefix: text immediately before the selection
    suffix: text immediately after the selection
```

`exact` is REQUIRED for text highlights. `prefix` and `suffix` SHOULD contain
enough unmodified context to disambiguate repeated quotations without storing
an excessive portion of the document. Reader MUST preserve whitespace and
Unicode content according to the selector's text projection rather than
normalizing it during YAML serialization.

### 14.3 Canonical text-position selector

Text positions are meaningful only against a defined plain-text projection:

```yaml
text_position:
  basis:
    profile: mdbase.reader.text-v1
    hash: sha256:3fa1d2...
  unit: unicode_code_point
  start: 4812
  end: 4931
```

Requirements:

- `profile` identifies the normative projection and normalization algorithm.
- `hash` is SHA-256 over the exact UTF-8 projected text.
- `unit` is `unicode_code_point` in v1.
- `start` is inclusive and `end` is exclusive.
- offsets count Unicode scalar values, not UTF-8 bytes or UTF-16 code units.
- `0 <= start <= end <= projected text length`.

The exact `mdbase.reader.text-v1` algorithm remains an open specification item
and MUST be fixed with cross-runtime fixtures before text positions are emitted
in production. Until then, Reader MAY omit `text_position`; quote and native
selectors remain valid.

PDF text extraction MUST NOT claim this profile merely because the PDF byte
revision matches. The projected text hash must also match.

### 14.4 HTML selector

```yaml
target:
  quote:
    exact: selected text
    prefix: preceding context
    suffix: following context
  text_position:
    basis:
      profile: mdbase.reader.text-v1
      hash: sha256:...
    unit: unicode_code_point
    start: 4812
    end: 4931
  html:
    css: article > section:nth-of-type(3) > p:nth-of-type(4)
    xpath: /article[1]/section[3]/p[4]
```

CSS and XPath selectors are optional accelerators against the stored immutable
representation. They MUST NOT be the only evidence for a text highlight.

### 14.5 EPUB selector

```yaml
target:
  quote:
    exact: selected text
    prefix: preceding context
    suffix: following context
  epub:
    cfi: "epubcfi(/6/14!/4/2/8:42)"
```

The CFI targets the exact EPUB revision. Reader SHOULD retain a CFI range when
the selected content spans a range. A collapsed CFI is sufficient for a
bookmark or current reading position.

### 14.6 PDF selector

PDF geometry uses physical zero-based page indexes and explicit coordinate
semantics:

```yaml
target:
  quote:
    exact: selected text
    prefix: preceding context
    suffix: following context
  pdf:
    page_index: 15
    coordinate_space:
      profile: pdf-default-user-space-v1
      box: crop
      origin: bottom_left
    quad_points:
      - [91.2, 238.1, 477.8, 238.1, 91.2, 218.0, 477.8, 218.0]
      - [91.2, 214.7, 311.6, 214.7, 91.2, 201.4, 311.6, 201.4]
```

Requirements:

- `page_index` is a zero-based physical PDF page index.
- A printed page value belongs in `locator.label`, not `page_index`.
- `profile` identifies a fixture-backed coordinate definition.
- `box` identifies the PDF page box used by the coordinates.
- `origin` is explicit.
- each quadrilateral has eight finite numeric coordinates;
- quadrilateral point order is defined by the selected profile;
- multiple quadrilaterals preserve multi-line and rotated selections.

`pdf-default-user-space-v1` MUST specify page rotation, inherited crop boxes,
coordinate ordering, and renderer conversion with fixtures before becoming a
portable contract guarantee. Reader MAY retain renderer-specific source
geometry during incubation but MUST label its profile accurately.

Axis-aligned rectangles MAY be derived for display. They are not the canonical
v1 geometry because they cannot represent every rotated or skewed selection.

## 15. Area annotations

An area annotation may lack extractable text. Its PDF geometry or future image
selector is canonical. A durable crop MAY be attached for human readability:

```markdown
---
type: reader-annotation
id: ann_01K2AA7T6N1V
source: "[[src_01K2AC00D9F3|Example paper]]"
document:
  file_id: 019c0000-0000-7000-8000-000000000301
  file: "[[files/example-paper.pdf]]"
  revision: sha256:a8ca22...
annotation_type: area
motivation: commenting
locator:
  label: p. 7, Figure 2
target:
  pdf:
    page_index: 6
    coordinate_space:
      profile: pdf-default-user-space-v1
      box: crop
      origin: bottom_left
    quad_points:
      - [72.0, 398.0, 510.0, 398.0, 72.0, 144.0, 510.0, 144.0]
created_at: 2026-08-09T15:18:00+10:00
---

![[files/annotation-ann_01K2AA7T6N1V.png]]

The diagram distinguishes causal from constitutive dependence.
```

The crop is a convenience representation. The source revision and selector
remain the authoritative target. A Reader-managed crop SHOULD itself use the
Connect file API and SHOULD record derivation provenance if it is referenced
outside the body.

## 16. Annotation transclusion

### 16.1 Native form

The canonical authoring form is an ordinary Obsidian-style embed:

```markdown
![[annotations/ann_01K2A7Q1M8S6]]
```

Reader MAY render a richer card with source, locator, colour, state, and **Open
in Reader** controls.

### 16.2 Semantics

- `annotation.source` is the authoritative provenance relationship.
- An embed displays an annotation at a chosen compositional location.
- Removing an embed does not delete or move the annotation.
- Embedding one annotation in several notes does not duplicate it.
- Deleting an annotation is an explicit record deletion.
- A source body MAY contain all, some, or none of its annotations.
- An annotation MAY be embedded in a note other than its source.

### 16.3 Capture policy

Reader MAY offer:

```text
Create annotation only
Append embed to the source note
Insert below a designated heading
Copy embed to clipboard
```

Creating the annotation and inserting an embed MUST be one revision-safe batch
or a recoverable transaction with no false-success state. A failed operation
must not leave an embed pointing to an annotation that was never committed.

## 17. Current reading state

### 17.1 Meaning

The optional `reading` object stores the current personal lifecycle and resume
state for one source:

```yaml
reading:
  status: reading
  progress: 0.42
  document_file_id: 019c0000-0000-7000-8000-000000000102
  position:
    quote: The imagination is continually at work
    epub:
      cfi: "epubcfi(/6/14!/4/2/8:42)"
  started_at: 2026-08-09T14:22:00+10:00
  last_opened_at: 2026-08-09T15:21:00+10:00
```

Absence of `reading` means no lifecycle state has been assigned.

### 17.2 Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `status` | when object exists | Current lifecycle state |
| `progress` | no | Decimal from 0 through 1 |
| `document_file_id` | no | Current source representation |
| `position` | no | Compact native and quotation resume selector |
| `started_at` | no | First meaningful read |
| `last_opened_at` | no | Most recent open |
| `finished_at` | no | Completion datetime |

Recommended statuses are:

```text
inbox
queued
reading
finished
archived
abandoned
```

Status is extensible. `document_file_id`, when present, MUST name one source
descriptor. A position selector is interpreted against the current descriptor
revision and SHOULD include sufficient native information to resume cheaply.
It need not carry the complete annotation selector envelope.

Reader SHOULD patch only `reading`, use optimistic revision checks, debounce
scroll-driven updates, and save at meaningful boundaries such as material
progress, document switch, backgrounding, close, or explicit status change.

Detailed reading history MUST NOT grow without bound inside `reading`. A future
`reading-session` extension can record append-oriented history while this
object remains the current materialized state.

Per-user state in a genuinely shared library requires a separate extension and
is not implied by this single-user v1 object.

## 18. Source relationships

Sources MAY carry extensible typed relationships:

```yaml
relations:
  - relation: is_version_of
    target: "[[src_01K2OLDVERSION|Earlier manuscript]]"
  - relation: translates
    target: "[[src_01K2FRENCHORIGINAL|La pesanteur et la grâce]]"
  - relation: replies_to
    target: "[[src_01K2ORIGINALPOST|Original post]]"
```

Recommended values include:

```text
is_version_of
has_version
translates
is_translation_of
supplements
is_supplement_to
reviews
is_reviewed_by
replies_to
references
```

Relationships are optional and extensible. They do not make an abstract Work
record mandatory and are not required for citation.

## 19. Materialisation and export

### 19.1 Purpose

Obsidian understands wikilink transclusions; Pandoc and generic Markdown tools
do not. Materialisation resolves canonical embeds without modifying the source.

Canonical source:

```markdown
This passage is especially important:

![[annotations/ann_01K2A7Q1M8S6]]

Compare Murdoch's formulation [@murdoch1970, pp. 33–34].
```

Materialised output:

```markdown
This passage is especially important:

> The imagination is continually at work filling up all the fissures through
> which grace might pass.
>
> — [@weil2002, p. 16]

This connects imagination with the avoidance of the void.

Compare Murdoch's formulation [@murdoch1970, pp. 33–34].
```

### 19.2 Rules

The materialiser MUST:

1. resolve selected wikilink embeds recursively;
2. detect and report cycles;
3. omit embedded frontmatter unless a template requests it;
4. preserve ordinary Pandoc citations;
5. add annotation source citation and locator when valid CSL is available;
6. provide a linked title/URL fallback when CSL is absent;
7. collect complete CSL items for cited and rendered sources;
8. resolve current and former citekeys with warnings;
9. report missing or invalid citekeys;
10. preserve broken embeds visibly;
11. leave canonical source records unchanged.

Conceptual output:

```text
build/
├── chapter.md
├── references.json
└── chapter.pdf
```

`build/` is derived output and SHOULD be excluded from record discovery unless
the user deliberately adopts an output as canonical content.

An explicit **Detach transclusion** action MAY replace one canonical embed with
materialised Markdown. It creates an independent copy and MUST be clearly
distinguished from ordinary materialisation.

## 20. Re-anchoring

Reader assesses selectors in this order:

1. exact `file_id` and `revision` plus valid native selector;
2. matching canonical text-basis hash plus text position;
3. exact quotation with both prefix and suffix;
4. exact quotation with one matching context side;
5. unique exact quotation;
6. fuzzy quotation match, marked uncertain;
7. unresolved annotation requiring repair.

Reader MUST distinguish:

- `exact`: stored selector is valid against the stored target revision;
- `reanchored`: a reviewed selector revision targets a new representation;
- `candidate`: a possible target awaits confirmation;
- `unresolved`: no acceptable target was found.

Re-anchoring MUST NOT silently mutate canonical annotations. An exact,
deterministic repair MAY be proposed for automatic acceptance under a published
rule. Any ambiguous or fuzzy match requires user confirmation.

Accepted repair SHOULD retain previous anchoring evidence in revision history
or an explicit extension so provenance is not lost. The v1 record need not
embed an unbounded selector history.

## 21. Canonical and derived data

### 21.1 Canonical user data

- source records and bodies;
- annotation records and bodies;
- current `reading` objects;
- original and captured files;
- stable normalized reading representations used as annotation targets;
- CSL metadata and former citekeys;
- record and file links;
- tags and relationships;
- user-accepted OCR, corrections, summaries, or derived notes.

### 21.2 Derived, reproducible data

- full-text and backlink indexes;
- parsed DOM and EPUB trees;
- PDF page renders and text-layout maps;
- thumbnails and transient previews;
- OCR caches not corrected or accepted by a user;
- embeddings;
- generated summaries not accepted into a record;
- file transfer queues and partial chunks;
- sync leases and retry state;
- re-anchoring candidates;
- materialised export files.

Derived data belongs in application storage or a reserved `.mdbase/` area
defined by the collection profile. It MAY be deleted and rebuilt without
losing user knowledge.

If a user edits or explicitly accepts derived text, Reader MUST save the result
as an ordinary canonical file or record and attach provenance.

## 22. Validation invariants

### 22.1 Source

- `type` implements the Reader source contract.
- `id`, `title`, `kind`, and `saved_at` are present.
- `id` is collection-unique.
- `documents[].file` resolves when present.
- committed Reader descriptors include matching `file_id` and `revision`.
- descriptor `file_id` values are unique within one source.
- at most one descriptor has role `primary`.
- `derived_from_file_id` resolves to another descriptor when present.
- `reading.status` is present when `reading` exists.
- `reading.progress` is between 0 and 1.
- `reading.document_file_id` names an attached descriptor.
- `reading.finished_at` is not earlier than `reading.started_at`.
- `csl` validates as one complete CSL JSON item.
- `csl.id` is collection-unique.
- `former_citekeys` contains unique non-empty values and excludes `csl.id`.
- relation targets resolve to source-contract records.

### 22.2 Annotation

- `type` implements the Reader annotation contract.
- `id`, `source`, `annotation_type`, and `created_at` are present.
- `id` is collection-unique.
- `source` resolves to a source-contract record.
- file-targeted annotations provide `document.file_id`, `file`, and `revision`.
- `document.file_id` belongs to the source.
- the stored `document.file` agrees with the current authority path or is
  reported as a repairable stale readable link.
- text highlights contain `target.quote.exact`.
- the body of a text highlight begins with a Markdown blockquote.
- text offsets are non-negative, ordered, and within a matching basis.
- a text basis names a known profile and exact hash.
- PDF `page_index` is a non-negative integer.
- each PDF quadrilateral contains exactly eight finite numbers.
- coordinate and text profiles are known or explicitly retained as unsupported
  extension values.
- `modified_at` is not earlier than `created_at`.

### 22.3 Cross-record warnings

The following conditions SHOULD produce diagnostics but need not make every
read impossible:

- displayed blockquote differs from `quote.exact`;
- readable file link is stale but `file_id` resolves;
- current file revision differs from annotation target revision;
- an annotation embed is broken;
- an annotation is not embedded in its source body;
- a former citekey remains in prose;
- friendly source metadata differs from CSL;
- a native selector profile is unknown to the current Reader version.

## 23. Atomic and revision-safe operations

The following actions MUST be atomic, one mdbase batch, or a durable recoverable
transaction with explicit partial state:

- upload required files and create their source;
- create an annotation and append its transclusion;
- update current reading state with a revision precondition;
- rename a source and update path-based references;
- move a file and update readable paths while retaining `file_id`;
- add CSL and reserve its collection-unique citekey;
- rename a citekey and update selected Pandoc references;
- delete a source with explicitly selected dependants;
- move an annotation to a different source;
- replace a target file and apply reviewed selector repairs.

Operations use optimistic revision checks. Reader MUST preserve user prose on
conflict and MUST NOT apply last-write-wins to an entire Markdown document.

An unknown mutation outcome MUST be reconciled through Connect's durable
mutation handle and original request identity. Reader MUST NOT repeat it as a
new logical mutation.

## 24. Deletion and lifecycle

### 24.1 Removing an embed

Deleting:

```markdown
![[annotations/ann_01K2A7Q1M8S6]]
```

removes only that presentation.

### 24.2 Deleting an annotation

Annotation deletion is destructive. Reader SHOULD show inbound links and
embeds and MUST require explicit confirmation when any are known. Broken
embeds are diagnosed rather than silently removed from unrelated user prose.

### 24.3 Deleting a source

Source deletion MUST NOT cascade silently. Reader reports:

- document representations;
- annotations linked to the source;
- backlinks, transclusions, and Pandoc citations;
- source relations;
- deferred subscription provenance when present.

The user can cancel, delete only the source, or explicitly select dependants.

### 24.4 Moving, replacing, and deleting files

- A move retains `file_id` and updates readable path links revision-safely.
- A replacement retains `file_id` only when the user deliberately replaces
  that logical representation.
- A replacement changes `revision` and triggers annotation/position assessment.
- A new edition or alternative representation SHOULD normally receive a new
  `file_id` rather than replace the old one.
- A targeted file MUST NOT be silently deleted.
- Keeping the old file is the safest conflict default.

## 25. Import mapping

### 25.1 Web page

1. Create a source from extracted friendly metadata.
2. Preserve submitted and canonical URLs.
3. Save an immutable HTML archive where permitted.
4. Create a stable normalized reading representation.
5. Attach both using committed `file_id`, path, role, and revision.
6. Leave CSL absent or create reviewable webpage/post metadata.

### 25.2 PDF or EPUB

1. Identify and hash the exact original file.
2. Check exact and probable duplicates.
3. Extract provisional friendly metadata.
4. Upload and receive committed stable file identity.
5. Create or attach to a source.
6. Add CSL only when supplied, sufficiently evidenced, or requested.

### 25.3 Zotero

1. Map each practical Zotero item to one source.
2. Preserve bibliographic data as complete CSL.
3. Attach PDFs, EPUBs, snapshots, and supplements directly.
4. Convert annotations into independent records.
5. Preserve quotation, comment, colour, page label, native selector, and
   imported provenance where available.
6. Convert Zotero PDF geometry into the Reader profile only through tested
   fixtures; otherwise retain it under an accurately named import profile.
7. Materialise Zotero notes into the source body only when chosen by the user.

### 25.4 Omnivore, Pocket, Karakeep, or Pulp

1. Map each saved item to a source.
2. Preserve URLs, saved dates, tags, notes, archive state, and available files.
3. Convert highlights to annotation records.
4. Put current lifecycle and resume state in `reading`.
5. Preserve import provenance.
6. Do not fabricate CSL certainty.

### 25.5 CSL JSON

- Match by exact stable import identity where one exists.
- Otherwise compare DOI, ISBN, PMID, canonical URL, title, creators, and date
  without silently merging ambiguous items.
- Validate every item before mutation.
- Resolve citekey collisions explicitly.
- Preserve unsupported valid CSL fields.

## 26. Outside-Reader behavior

### 26.1 Plain text editor

The user sees ordinary YAML, Markdown, readable filenames, direct file links,
exact selected quotations, and visible annotation embeds.

### 26.2 Obsidian without a plugin

- source and annotation records open normally;
- annotation transclusions render;
- backlinks connect annotations and literature notes;
- PDFs and images remain ordinary attachments;
- native selectors remain readable frontmatter even when exact navigation is
  unavailable.

### 26.3 Obsidian with an optional Reader integration

An integration MAY add exact-position opening, citation editing, Reader views,
selector repair, materialisation, and safe deletion. It MUST NOT become the
only location of canonical annotations or citations.

### 26.4 Pandoc

Pandoc consumes materialised Markdown and generated CSL JSON. Authored Pandoc
citations remain canonical. Reader-specific transclusions are resolved before
processing.

### 26.5 Other Connect applications

Other applications consume contract projections through their own exact
collection grants. They MUST NOT depend on Reader's local cache or credentials.

## 27. Deferred subscription extension

A future subscription record can describe an RSS feed, Atom feed, newsletter
inbox, or other recurring source. Individual entries become ordinary source
records.

Illustrative, non-normative form:

```markdown
---
type: reader-subscription
id: sub_01K2A80A9D3P
title: Example Newsletter
subscription_type: newsletter
site_url: https://example.substack.com
feed_url: https://example.substack.com/feed
delivery:
  method: rss
status: active
created_at: 2026-08-09T15:30:00+10:00
defaults:
  status: inbox
  tags:
    - newsletter
---

Notes about why I subscribe and what I am looking for can go here.
```

Subscription execution, credentials, deduplication receipts, and polling state
require their own specification. They are not part of source or annotation v1.

## 28. Schema evolution

Reader contract and starter-type changes follow these rules:

- adding an optional field is preferred to changing existing meaning;
- selector profile changes receive new profile identifiers;
- citekey and identity semantics do not change silently;
- migration is assessed and reviewed through Connect collection setup;
- managed definition updates use digest-pinned resources;
- existing user-owned definitions are never silently adopted or overwritten;
- exact source documents and annotation bodies are preserved through schema
  migration;
- destructive or lossy migration requires explicit export and confirmation;
- a newer Reader retains unknown extension fields wherever safe.

Beta contract versions may break, but every breaking change still requires an
explicit migration path for collections containing real user data.

## 29. Minimal coherent v1

The smallest source is:

```markdown
---
type: reader-source
id: src_01K2A6Y4G7C8
title: Example
kind: article
saved_at: 2026-08-09T16:00:00+10:00
url: https://example.com
---

My note about this source.
```

A source with a committed document is:

```yaml
type: reader-source
id: src_01K2A6Y4G7C8
title: Example
kind: article
saved_at: 2026-08-09T16:00:00+10:00
documents:
  - file_id: 019c0000-0000-7000-8000-000000000401
    file: "[[files/example.html]]"
    role: primary
    revision: sha256:...
reading:
  status: reading
  progress: 0.4
  document_file_id: 019c0000-0000-7000-8000-000000000401
```

The smallest text highlight is:

```markdown
---
type: reader-annotation
id: ann_01K2A7Q1M8S6
source: "[[src_01K2A6Y4G7C8|Example]]"
document:
  file_id: 019c0000-0000-7000-8000-000000000401
  file: "[[files/example.html]]"
  revision: sha256:...
annotation_type: highlight
target:
  quote:
    exact: Selected text.
    prefix: Context before.
    suffix: Context after.
created_at: 2026-08-09T16:05:00+10:00
---

> Selected text.

My note.
```

CSL, multiple representations, text positions, native selectors,
materialisation templates, subscriptions, and detailed reading history can be
added without invalidating these records.

## 30. Final model

```text
Source note
  One human-managed Markdown literature note
  Friendly cross-application library metadata
  Optional complete CSL JSON
  Direct file descriptors:
    stable file_id
    readable file path/link
    exact byte revision
  Compact current reading state

Annotation
  One independently addressable Markdown record
  Stable source link
  Stable logical file identity plus exact target revision
  Explicit exact quotation and context
  Defined text projection when offsets are present
  Format-native EPUB, HTML, or PDF selector
  Human-readable quotation and freely authored note
  Freely transcludable without changing ownership
```

This model keeps Reader useful as a polished application while making the
actual library durable, inspectable, and available to separately authorized
applications.
