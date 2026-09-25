# mdbase Reader Exporter for Zotero

An **experimental, installable Zotero plugin** that exports a personal library as a versioned migration bundle. It is not a Connect client and does not create an mdbase collection. Reader's future importer will consume the folder and write to the user's selected collection.

## Build and install

From the repository root (Node 22.12+):

```sh
pnpm --filter @mdbase-reader/zotero-exporter build
pnpm --filter @mdbase-reader/zotero-exporter test
```

Output:

```text
apps/zotero-exporter/dist/mdbase-reader-exporter-0.1.0.xpi
apps/zotero-exporter/dist/mdbase-reader-exporter-0.1.0.xpi.sha256
```

In Zotero: **Tools → Plugins → gear → Install Plugin From File…**, select the XPI. Then open **Tools → Export for mdbase Reader…**. No restart is required. Disable/uninstall using the same Plugins screen.

Compatibility is deliberately restricted to **Zotero 10.0.x**; acceptance testing used **10.0.2 on Linux x86-64**. Windows/macOS and earlier Zotero releases have not been tested. The package has its own version and can be released independently of the Reader web app.

## Workflow

1. Finish syncing in Zotero.
2. Choose a parent folder **outside Zotero's data directory**.
3. Review source, note, annotation and attachment counts, missing-file warnings and disk-space estimate.
4. Click **Export library**. A uniquely named child folder is created; existing exports are never overwritten.
5. Wait for completion, review warnings, and use **Show folder**.

This release exports all of **My Library**, not a selected collection or group library. Trashed records are excluded; surviving children with trashed parents are preserved with warnings. Missing attachments retain their metadata. Don't edit Zotero while exporting: a final consistency check detects changes and refuses to label that export complete.

Progress is in attachment records (including missing files and URL-only links), not just files. Cancellation takes effect between file operations. Closing an active export window requests cancellation rather than leaving a hidden copy running. Disabling the plugin aborts and awaits active work before removing its resources.

A cancelled/failed export stays on disk with an incomplete manifest; it must not be imported. There is **no resume in v0.1.0**: choose a folder again to create a fresh export. Partial folders may be manually removed after checking their manifest. App crashes can leave `exporting` status, also not importable.

## Data and privacy

The bundle contains native Zotero JSON, CSL, original file bytes, HTML snapshot assets, native annotations, collections, relative paths and SHA-256 checksums. File hashing runs asynchronously via Mozilla's IOUtils; PDFs are never rewritten to embed annotations. Every copy is awaited and verified.

See [the bundle specification and standalone exporter](../../scripts/zotero-bundle/README.md) for schema, limitations and independent validation:

```sh
node scripts/zotero-bundle/validate.mjs /absolute/path/to/bundle
```

The plugin does not upload library data, collect telemetry, or access mdbase credentials. The folder is private: it includes research notes, attachment content and a Zotero user-ID namespace. Original filesystem paths are omitted from attachment JSON, but user-authored notes/metadata can themselves contain private paths or URLs. Do not publish bundles as public test fixtures.

**Update distribution is not deployed.** Zotero 10 requires a non-empty `applications.zotero.update_url` even for local installation. The manifest reserves `https://reader.mdbase.dev/zotero/updates.json`; Zotero may check it using its standard add-on update mechanism. There is no update feed or automatic release upload implemented here. Install updates manually until that endpoint and a release process are deliberately deployed. No website/DNS/deployment changes are part of this plugin build.

## Implementation

- `src/bootstrap.js`: lifecycle hooks, Tools menu, resource registration, native folder picker and dialog management.
- `src/controller.js`: injected, tested preflight/export/cancel state machine.
- `src/content/`: privileged XHTML interface, keyboard controls, light/dark styling and warning report. Local resources only.
- `scripts/build.mjs`: deterministic ZIP/XPI packaging with an explicit seven-file allowlist and SHA-256 receipt. No ZIP CLI or additional dependencies needed.
- `../../scripts/zotero-bundle/exporter.js`: shared extraction engine, copied into the XPI at build time rather than forked.

The tests run through the workspace's normal `pnpm test`. No Reader importer, account authorization or collection mutations are included.

## Acceptance evidence — 2026-09-16

Built XPI installed successfully in Zotero 10.0.2. Tools menu and real XHTML dialog were exercised. Native folder picker opened and its selection triggered preflight. UI-button export cancellation after three attachment records produced `phase: cancelled` and a `cancelled` manifest, with no false success.

A fresh export through the installed plugin completed with:

- 959 sources (with CSL), 494 notes, 3,641 native annotations and 16 collections.
- 782 attachment records: 740 available files, 21 missing files, 21 URL-only links.
- 1,206 payload files, 4,963,048,103 bytes, all independently SHA-256 verified.
- 25 warnings: 21 missing files and four notes whose parents are in the trash.
- Exact metadata/annotation equality and all payload hash equality with the earlier independently verified standalone bundle.

Disabling removed all Tools menu entries and closed the exporter dialog; re-enabling restored exactly one menu entry. The plugin was left enabled. Export fixtures and screenshots remain outside the repository.

Private successful test output:

`~/Exports/zotero-reader-2026-09-16T09-49-27-348Z-63330ed3/`

## Remaining before broader distribution

Cross-platform and version coverage, selected-collection/group export, unsigned-in library identity, resumable journalling, more embedded-note-image fixtures and reviewed Better BibTeX citekey extraction. Disk estimates cover available payloads plus 128 MiB headroom, not filesystem compression/quotas or arbitrary growth during export. Disk-full and copy failures remain explicit failures. Bundle parsing, coordinate conversion and hosted import belong in Reader, not this plugin.
