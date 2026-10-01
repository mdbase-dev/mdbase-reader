# mdbase Reader

Read, highlight, and organise your research in an mdbase collection. Reader brings together
PDFs, EPUBs, saved web pages, Markdown source notes, and citation metadata without keeping your
library in a separate, application-only database.

**[Open Reader](https://reader.mdbase.dev)** ·
[Try the interface preview](https://reader.mdbase.dev/?preview=1) ·
[Report a problem](https://github.com/mdbase-dev/mdbase-reader/issues)

Reader is prerelease software. Keep backups of important collections and check that changes
have saved before closing or reloading.

## See it in action

**Highlight a passage, get a Markdown file.** Each highlight is saved as its own annotation
record, and embedding it in a source note adds an ordinary `![[…]]` link.

https://github.com/user-attachments/assets/63fc8fa6-ea46-47d8-b1a4-30b935813e62

**Save from the web.** The browser extension picks up the page's citation, saves highlights and
comments from the side panel, and opens the saved copy in Reader.

https://github.com/user-attachments/assets/5a409367-e210-4e01-8f79-68ce13161f87

**Views, annotations and panes.** Table and shelf views, every annotation in one table, the
command palette, and two sources open side by side.

https://github.com/user-attachments/assets/dda8451e-4d98-4832-a592-7b4fef1851a9

These recordings use sample data, not a real collection.

## What you can do

- Read PDFs, EPUBs, and saved web pages in one library.
- Highlight passages, add comments and tags, and return to an annotation in its source.
- Write Markdown notes alongside your reading.
- Organise and search sources and annotations.
- Keep citation metadata with your sources and export a bibliography.
- Save articles and PDFs from Chrome with the optional browser extension.
- Import a library from Zotero or Readwise.

## Get started

1. Open [Reader](https://reader.mdbase.dev).
2. Connect a collection through [mdbase Connect](https://connect.mdbase.dev). Sign in, choose
   an existing collection or create one, and review Reader's requested access.
3. If Reader asks to set up the collection, review the proposed source and annotation types,
   then choose **Apply reviewed setup**. Setup is not applied without your approval.
4. Choose **Add source…** to add a file, or open an existing source from the library.
5. Select text in the document to create a highlight. Use the annotation panel for comments
   and the source note editor for longer notes.

A collection is the home for your source records, annotations, notes, and files. It can be
hosted through Connect or registered from your computer. For a computer-backed collection,
keep the Connect desktop app running and the computer available while using Reader.

Want to look around first? The [interface preview](https://reader.mdbase.dev/?preview=1) uses
sample data held in memory and does not create records or files in a collection.

## Make the workspace your own

Open several sources in tabs, or drag a tab to the edge of a pane to read side by side. The
Sources sidebar and source tools can also be moved or grouped with document tabs. Your layout
is remembered for each collection.

Press **Ctrl/⌘+K** to search sources and run commands. **Reset pane arrangement** restores the
layout without closing your tabs. **F6** moves between pane groups.

Use **Ctrl/⌘+Shift+F** to filter sources in the sidebar. Library search offers separate scopes
for metadata, note text, and loaded-document text; document search does not include unopened
or suspended documents. **Ctrl/⌘+F** remains available for searching within the reading surface.

## Save from the web

The optional Chrome extension saves articles and PDFs to your collection and lets you
highlight web-page text while you read. It requires **Chrome 123 or newer**.

### Install

Install [mdbase Reader from the Chrome Web Store](https://chromewebstore.google.com/detail/mdbase-reader/kimdfjefhbfgfecconmaiaaindjccidp)
for automatic updates. Follow the welcome screen to connect a collection, then pin Reader to
the toolbar.

If you previously used an unpacked copy, disable it to avoid duplicate capture actions. The
store version needs its own Connect authorization; grants and settings do not migrate automatically.

For manual installation, download the browser-extension ZIP from the repository's
[releases](https://github.com/mdbase-dev/mdbase-reader/releases) and extract it. Open
`chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the
folder containing `manifest.json`. Unpacked copies do not receive automatic updates.

### Capture and highlight

- Click the toolbar button or press **Alt+Shift+S** to open Reader's side panel. It stays open
  as you switch tabs and follow links, showing whichever page you are on.
- Review the destination collection, title, citation, tags, and note, then choose **Save page**
  or **Save PDF**. Opening the panel does not automatically save the page.
- On a web page, select a passage and choose a highlight colour in the panel to save it. Add
  a comment first if you like. You can also use **Alt+Shift+H** or the right-click highlight action.
- **Ctrl/⌘+Enter** saves the selected passage, or the page when no passage is selected.
- For a saved PDF, choose **Open in Reader to highlight**.

Articles are saved as readable copies with a DOM archive; PDFs are saved as PDF files. When
citation information is available, the panel shows what it will store. DOI lookup sends the
DOI to doi.org to retrieve citation metadata.

The extension reads the HTTPS pages you visit so the panel can follow your tabs, and checks
each page's address against your selected collection: saved pages show a badge on the toolbar
button and your highlights. If you limit its site access in Chrome, press the toolbar button
on a page to use Reader there; **Settings** offers to restore access.

## Bring an existing library

Open [Import a library](https://reader.mdbase.dev/import), or choose **Import a library…** from
the command palette. Review the import preview and destination collection before confirming.

- **Zotero:** use the experimental Zotero 10.0.x exporter linked from the import page. In Zotero,
  install the `.xpi` through **Tools → Plugins → Install Plugin From File…**, then choose
  **Tools → Export for mdbase Reader…**. In Reader, select the complete exported folder—not
  Zotero's data directory. Folder selection requires a supporting browser such as Chrome.
  The exporter includes references, original files, notes, collections, and native annotations
  from **My Library**; selected-collection and group-library exports are not supported.
- **Readwise:** enter your Readwise access token and scan the library. Reader imports documents
  and files, plus highlights from classic Readwise sources. Classic sources such as Kindle
  import as metadata and highlights, without the book text. The token stays in memory in the
  tab and is sent only to Readwise; the importer only reads from Readwise.

Large imports can take several minutes. Keep the import tab open and review completion
warnings. Zotero export bundles contain private library content: do not share them publicly.

## Your data and saving

Reader works directly with your mdbase collection. Sources, annotations, reading state,
citation metadata, and files remain collection data that other mdbase tools can use.
You choose which collections Reader may access through Connect.

Source-note drafts can be recovered locally, and conflicting edits are presented for review.
Annotation comments autosave, but pending annotation text and new PDF crops are held in memory:
a forced reload can lose unsaved work. Creating a new highlight requires an explicit action.

## Help and feedback

If a collection will not open, check your Connect access and, for a computer-backed collection,
that its desktop app is online. Follow Reader's reconnect or access-review prompt when shown.

[Open an issue](https://github.com/mdbase-dev/mdbase-reader/issues) for bugs or feature requests.
Include your browser, the document format, and steps to reproduce; remove private notes,
collection paths, and credentials. Report suspected vulnerabilities privately as described in
the [security policy](SECURITY.md).

## Development

Want to build Reader or contribute? See the [development guide](docs/development.md) for local
setup, checks, extension builds, deployment, and architecture notes.

## License

mdbase Reader is available under the [MIT License](LICENSE).
