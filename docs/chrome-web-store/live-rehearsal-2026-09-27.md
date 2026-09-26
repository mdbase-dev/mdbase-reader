# Production rehearsal and store draft — 2026-09-27

**Unsubmitted, unpublished; not submission-ready.** TaskNotes was not edited.

## Candidate and environment

- Commit: `adc9d27f86d0040320f5f26f2d96c176c33aa92b`.
- ZIP: `apps/extension/release/mdbase-reader-0.2.0.zip`.
- SHA-256: `79565e2b93c7b8b1d294cc9a83aa4dcb97f1ce2681d8281d428a282f2cf080e3` (reverified before extraction).
- Chrome: `152.0.7977.82`, Linux, existing Profile 12.
- Installed the unchanged ZIP contents through Chrome's normal Load unpacked UI, after enabling Developer mode. Private extraction: `~/.local/state/mdbase-reader/chrome-web-store/candidate-79565e2b/`.
- This was a fresh extension installation, **not a fresh browser profile or a store-installed extension**. The portal already had the dedicated reviewer password session. Independent password login was separately checked with a fresh cookie jar on September 26.
- Production Connect and Reader; only the dedicated hosted `Reader Review Demo` collection was authorized. No personal collections or desktop connectors were used.

## Passed through normal visible UI

1. Welcome page opened automatically after installing the candidate.
2. Connect opened the ordinary device-code approval page. Compared its code to the code on the extension welcome page before approval. The collection was Reader Review Demo; approved its Reader setup/access request. Returned to welcome and verified the connected collection.
3. Opened <https://en.wikipedia.org/wiki/Commonplace_book>. Actual `Alt+Shift+S` invocation opened the side panel (no simulated API invocation or permission bypass).
4. Corrected the publisher-derived title to `Commonplace book`, entered `demo, reading` tags and an attribution/demo note, and explicitly saved. The panel reported success after uploading the reading copy/archive.
5. Selected the opening sentence on the original page. The panel received the selection; saved a yellow highlight with the comment “Keep useful ideas together, then return to their original context.” and tag `demo`.
6. Deselected the text. A yellow highlight appeared on the original article; the panel reported `1 of 1 highlights shown`.
7. Opened Reader, selected the saved source in Library and pressed Enter. Verified the readable copy, matched highlight, and exact saved comment in the annotation sidebar.
8. Opened <https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf>. Invoked the extension with `Alt+Shift+S`, saved as `PDF capture demo (W3C dummy)` with tag `demo`, and observed save success.
9. In Reader's Library, selected the PDF and pressed Enter. The actual one-page PDF rendered with “Dummy PDF file”.

Demo content now contains two public sources and one article annotation. The test did not weaken browser permission enforcement.

## Issue found

**Saved-copy deep link does not reliably select its source in the deployed Reader.**

- The article's “Open saved copy in Reader” opened a new Reader tab with `collection` and `source` query parameters, but showed Library rather than the document.
- After opening the article manually, the PDF's saved-copy link opened a new tab with the PDF source ID in its URL, but restored the previous article view instead.
- Both sources were present and readable. Workaround: choose Library, select the desired row and press Enter. Clicking an already-selected editable title can start inline editing; Enter on the row reliably opened it.
- Record as a release follow-up; no production Reader deployment or candidate replacement was attempted during this rehearsal.

## Chrome Web Store draft

Item ID: `kimdfjefhbfgfecconmaiaaindjccidp`.

- Separate mdbase Reader 0.2.0 draft exists; status explicitly says unpublished.
- Description saved, category Tools, language English, 128px icon and Reader homepage saved.
- Two real 1280×800 screenshots and a 440×280 promotional tile uploaded; all three were present after reload and normal Google passkey reauthentication.
- Single purpose, five API permission justifications and combined host justification verified in the Privacy UI. Remote-code answer is No.
- Draft data boxes currently checked: personally identifiable information, authentication information, web history, website content. Other boxes unchecked. **Not final:** the dashboard explicitly includes IP addresses under Location; reconcile Connect/DOI network metadata and service activity reporting with the final policy/category choices before certification.
- All three data-use certifications remain unchecked. Privacy-policy URL is blank. The existing mdbase.dev policy describes Connect, but does not substitute for the extension-specific disclosures in the draft policy.
- Private reviewer username/password persisted from September 26. On September 27 only the instructions were edited; credentials were left untouched. Reload confirmed the dated save banner and the new 492-character instructions, including actual fixtures and the deep-link workaround.
- The proposed GitHub issue support URL returned 404 in the earlier check and was not entered. A supported public contact route still needs confirmation.
- No Submit for review or Publish action was taken.

## Still open

- Fix/retest deployed Reader's source deep links (or explicitly accept the documented workaround).
- Finalize and publish the extension policy, operator/contact and backend retention/deletion/provider facts; reconcile data categories and obtain publisher confirmation before certifications.
- Finish optional permission deny/grant/remove and background-traffic checks, repeated highlight/context-menu/toolbar coverage, authenticated live reset/reconnect and server revocation. Offline reset automation already passed; do not confuse it with these live checks.
- Fresh-browser end-to-end reviewer rehearsal, Chrome 123 minimum-version evidence, and store-installed identity validation through an appropriate reviewed distribution path.
- Keep the dedicated reviewer account and demo collection available for review; do not remove them as temporary fixtures.

Private desktop captures remain under the managed local capture directory; do not commit account/authorization screenshots or credentials. Public listing image provenance is documented in `assets/README.md`.
