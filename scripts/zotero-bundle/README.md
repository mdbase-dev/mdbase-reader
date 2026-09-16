# Zotero migration-bundle prototype

A standalone, read-only exporter shared with the [installable Zotero plugin](../../apps/zotero-exporter/README.md). It does **not** create an mdbase collection, connect to a service, or modify Zotero records. The future Reader importer will convert this bundle and upload it to the selected (e.g. hosted) collection.

## Run in Zotero

Tested on Zotero **10.0.2 / Linux x86-64**. Wait for sync to finish. Use **Tools → Developer → Run JavaScript**, enable **Run as async function**, and adapt these absolute paths:

```js
const scope = {};
Services.scriptloader.loadSubScript(
  "file:///home/calluma/projects/mdbase-reader/scripts/zotero-bundle/exporter.js",
  scope,
);
const api = scope.ReaderZoteroBundle;
return await api.exportLibrary(api.createZoteroAdapter({ Zotero, IOUtils, PathUtils }), {
  destination: "/home/calluma/Exports/my-new-zotero-bundle",
});
```

The destination's parent must exist. The destination itself **must not exist**. Existing exports and partial exports are never overwritten. Leave Zotero running and do not edit the library while exporting. Available disk space must accommodate the original files and snapshot resources.

A plugin can load the same script, supply a folder picker, `AbortSignal`, and `onProgress({completed,total,key})` callback. It needs no Connect credentials. The adapter is separate from the extraction orchestration so tests can use an in-memory fixture.

## Bundle v1 (experimental)

```text
manifest.json
items.json
notes.json
annotations.json
collections.json
attachments.json
files/<zotero-attachment-key>/<original-filename>
```

- Manifest format: `dev.mdbase.reader.zotero-bundle`, version `1`.
- Source identity is namespaced by Zotero user ID, not numeric database row IDs. Version 1 exports the **entire personal library excluding explicitly trashed items**. Collection selection and group exports are not yet implemented.
- Records have a stable `key` and native Zotero API JSON under `zotero`. Sources also include CSL from Zotero's built-in conversion. CSL IDs are **not promised to be Better BibTeX citekeys**; raw fields/Extra remain available for a later reviewed mapping.
- Notes retain their HTML, including embedded Zotero links. Attachments retain any legacy embedded note body. No Markdown conversion or link rewriting occurs at extraction time.
- Annotations retain original type, selectors, quotes, comments, colours, dates, tags and parent attachment keys. PDF, EPUB, image and ink selectors are not interpreted or converted.
- Collections retain hierarchy; native item JSON retains membership. Neither is flattened into filenames or tags.
- Attachments explicitly distinguish `available`, `missing-file`, and `linked-url`. Linked files are copied only when locally accessible. Missing attachments remain metadata records, with warnings. Original filesystem paths are omitted from native attachment JSON.
- Original file bytes are copied, **never** PDF-rewritten to embed annotations. HTML snapshots include their adjacent support files recursively, excluding `.zotero*` caches. Other file attachments copy only their primary payload. Derived annotation image caches are not included; their native selectors are retained.
- Each payload has a relative path, byte count and SHA-256 digest in the manifest. Each attachment lists its primary path and all payload paths.
- The manifest starts as `exporting`; its terminal status is `complete`, `complete-with-warnings`, `failed`, or `cancelled`. Readers must refuse incomplete statuses. JSON writes use temporary files and atomic replacement. There is no resume yet: a failed/cancelled export must be repeated into a new destination.
- Copying is awaited and sequential. Each copy is checked against the original SHA-256; source stats and hashes are rechecked. Native item/collection JSON is compared at the start and end to detect concurrent edits. This is a consistency check, not a database snapshot lock.
- Symlinks, unsafe path components, unsupported snapshot file types and unexpected copy errors fail the export rather than silently omit data. File hashing uses asynchronous native `IOUtils.computeHexDigest`, not a whole-library memory buffer or synchronous main-thread hash.

## Verify independently

```sh
node scripts/zotero-bundle/validate.mjs /absolute/path/to/bundle
node --test scripts/zotero-bundle/*.test.mjs
```

The Node validator independently checks file hashes, byte counts, totals, parent identities, collection references/ancestry, primary files, documented omissions and unlisted files/symlinks. It does not prove PDF readability, CSL schema compliance, annotation coordinate interoperability, or that the entire remote account synced correctly. It is a development verifier, not yet a hardened browser import parser.

## Real-library acceptance test — 2026-09-16

A private bundle was created outside the repository at:

`~/Exports/zotero-reader-bundle-2026-09-16/`

Results:

| Data                            |         Count |
| ------------------------------- | ------------: |
| Sources, all with CSL           |           959 |
| Native notes                    |           494 |
| Native annotations              |         3,641 |
| Collections                     |            16 |
| Attachment records              |           782 |
| Available attachment payloads   |           740 |
| Missing file attachments        |            21 |
| URL-only attachments            |            21 |
| Files including snapshot assets |         1,206 |
| Verified payload bytes          | 4,963,048,103 |

Independent verification:

- All 1,206 file SHA-256 digests passed.
- All 740 primary attachment hashes matched their originals in Zotero storage.
- All 3,641 annotation JSON records exactly matched the earlier independent native extraction: 3,525 highlights, 107 notes, 5 image annotations, 4 ink annotations.
- All 494 native notes are retained (including four with empty note content). The earlier RDF had only 490 Memo elements; this exporter avoids that conversion entirely.
- Four **different** notes refer to parents in Zotero's trash. The parent records were explicitly checked in Zotero and confirmed deleted. The notes are preserved and the missing-parent links are reported; trash is not silently included or notes discarded.
- Missing files: the known 12 unavailable linked files and 9 unavailable stored attachments.
- The 71 PDFs that the RDF annotation-embedding path failed to write were all copied unchanged successfully. No claims about their readability are made.
- Export status: `complete-with-warnings` (21 missing files, 4 missing parents). No library-change failure occurred.

The output is private user data and must not be committed or published. Only code, synthetic fixtures and aggregate results belong in this repository.

## Before packaging as a public plugin

The plugin now provides a folder picker, preflight disk-space estimate, progress/cancel UI, asynchronous native hashing and XPI packaging. Still needed: resumable journalling and tests on additional Zotero versions/OSes; collection/group selection and stable identity for unsigned-in libraries; embedded note images and more snapshot formats; a reviewed Better BibTeX integration rather than guessing citekeys. Add bundle schema validation and source-hash binding for annotation targets when building Reader's importer. The Reader bundle importer is not implemented yet.
