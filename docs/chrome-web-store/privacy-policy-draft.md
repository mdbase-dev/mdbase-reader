# mdbase Reader browser extension — privacy policy draft

**NOT FOR PUBLICATION YET.** Confirm the operator, contact, hosting/service-provider practices, retention and deletion details below. Reconcile with the final archive minimization decision and release build. This document is not a claim about unreviewed backend operations.

Effective date: TODO

Operator: TODO: publisher's legal/person name

Privacy contact: TODO

## What the extension does

mdbase Reader helps you save supported web articles and PDFs, add highlights and notes, and revisit them in an authorized mdbase collection. It uses mdbase Connect to access that collection.

## Information the extension processes

### Pages you choose to capture

When you invoke the extension on a supported page, it processes the page's address, title, content, available citation metadata and selected text to prepare a capture. When you save, it sends the source content and the tags, notes, comments or highlights you have entered to your selected collection through mdbase Connect.

For articles, the extension saves a readable copy and a minimized text-and-structure HTML archive. Both omit scripts, forms, embedded application state, arbitrary attributes and resource/link URLs from the stored document markup. Explicitly hidden elements are removed, but this is not anonymization or a guarantee that all private information is removed: page text, titles, citation metadata and separately saved source addresses (including query parameters) can contain personal information. Only capture content you intend to store in that collection. These changes apply to new captures; they do not rewrite previously saved archives.

For supported PDFs, the extension downloads the document to save it. Where Chrome permits, it uses the page's existing access to obtain the PDF. That may involve the original website using your existing login cookies; the extension does not copy those cookies into the saved document as part of this download operation.

### Citation lookups

When a DOI is available, citation preparation may send the DOI to `doi.org` and the registration service to which it redirects, such as Crossref or DataCite. This can happen when you open a capture, before you save it. The lookup does not intentionally send your notes, highlights or full article content. The receiving services also receive ordinary network information such as your IP address. Extension DOI requests omit cookies.

### Optional saved-page recognition

If you enable “Mark pages I’ve saved and show my highlights on them”, Chrome asks you to allow access to HTTPS websites. The extension then queries your selected collection using the addresses of HTTPS pages you visit, including pages you have not saved, to find matching saved sources. It retrieves saved highlights and may read page text to display them. Queries pass through the configured Connect route; this feature is not purely a local browser comparison.

Turning this feature off disables these background lookups and requests removal of the optional HTTPS website permission.

### Connection and local browser state

The extension stores Connect authorization state, collection selection, preferences and write-recovery information in Chrome's extension-local storage. SDK signing keys and application identity are stored in the extension's IndexedDB databases. Recovery information can include identifiers, URLs and pending mutation data. Draft text and selected passages are held in extension session storage; tab closure triggers draft cleanup. Drafts are not stored through Chrome's synchronized storage by this implementation.

Authorization grants are sensitive credentials. The extension uses them to access collections you authorize rather than using ambient portal cookies for its API requests. The separate Connect approval website has its own login/session handling.

## Where information goes

The production extension is configured to contact `https://connect.mdbase.dev/`. Depending on your collection and route, records and files are handled by hosted collection services or your running mdbase connector, with a cloud relay where applicable. Do not assume all traffic remains on your computer.

For connector-backed collections, optional direct access can connect to the mdbase service on your own computer (currently `http://127.0.0.1:28485`). Chrome separately controls the localhost host permission and any local-network approval. You may continue using an available relay without enabling direct local access.

The Reader web app, websites you capture and DOI services are separate services with their own practices.

TODO before publication: identify the operator's hosting/relay providers and subprocessors, information they receive, operational/security logging, relevant storage locations and applicable policy links. Verify SDK network behaviour and actual service configuration. Do not imply end-to-end encryption or zero backend retention without evidence.

## Purposes and sharing

The extension uses information to provide capture, citation preparation, annotation, authorized collection access, saved-page recognition and interrupted-write recovery.

TODO operator confirmation before publication: no sale of user data; no advertising or unrelated profiling uses; no transfers except as necessary for the stated functions, security/legal purposes or other explicitly disclosed and permitted uses. A source audit alone cannot certify the operator's business practices or service-provider conduct.

## Retention and your controls

- Saved sources, files and annotations remain in the selected collection until removed using the collection's supported controls. Removing the browser extension does not delete those records or files.
- Session drafts are temporary; local preferences, authorization and recovery state can persist across browser restarts.
- Disable saved-page recognition in extension Settings to stop background URL lookups. Browser extension controls also allow you to manage granted website permissions.
- Settings → Disconnect this browser → Disconnect and clear local data restarts the extension, removes optional website/local-connector permissions, and clears extension-local storage, session drafts and IndexedDB credentials. Confirmation is required because this also discards pending-write recovery information. Finish saves first: a write already sent may still complete. If cleanup fails, the extension blocks connections and offers a retry.
- Local cleanup does not revoke server-side authorization or delete collection content. Other browsers are unaffected. Existing on-page highlights may remain until the page is reloaded.

TODO before publication: document and verify the exact Connect authorization revocation procedure, treatment of pending recovery state, record/file deletion procedures, and hosted/relay log and backup retention/deletion periods. Specify how to make a privacy/deletion request using the approved contact.

## Policy changes and contact

We will publish updates at TODO: stable privacy-policy URL, with an updated effective date. Contact TODO for questions and privacy requests.
