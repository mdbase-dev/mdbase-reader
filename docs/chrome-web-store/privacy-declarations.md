# Dashboard privacy and permissions draft

Do not certify or submit these fields until the implementation, service facts and public privacy policy agree. Use the current dashboard's exact category definitions; the mapping below is preparation, not completed declarations.

## Single purpose

Save and annotate supported web reading in an authorized mdbase collection, and recognize and display those saved annotations when revisiting pages.

## Chrome permission justifications

| Permission                     | Draft justification                                                                                                                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                    | Temporarily inspect the supported page the user invokes Reader on, including its content and selected text, to prepare an article/PDF capture and web-page highlights.                                                                                                                       |
| `scripting`                    | Execute bundled capture, selection and annotation-rendering functions on authorized pages. This supplies the content the user saves and displays saved highlights.                                                                                                                           |
| `storage`                      | Persist Connect authorization state, chosen collection, preferences and interrupted-write recovery state in extension-local storage, and temporary per-tab drafts in session storage.                                                                                                        |
| `contextMenus`                 | Offer selection actions to save a highlight or highlight with a comment in Reader.                                                                                                                                                                                                           |
| `sidePanel`                    | Present the capture form and highlight/comment controls beside the page being read.                                                                                                                                                                                                          |
| `https://connect.mdbase.dev/*` | Access the production mdbase Connect API for authorization and authorized collection record/file operations. This host is not a browsing-page permission.                                                                                                                                    |
| Optional `https://*/*`         | Only after the user enables saved-page recognition, look up visited HTTPS page URLs in the selected collection and render matching saved highlights on those pages. It must work on arbitrary HTTPS sites chosen by the user. The setting requests removal of this permission when disabled. |
| Optional `http://127.0.0.1/*`  | After explicit approval, allow direct access to the user's running mdbase connector for connector-backed collections, as an alternative to the cloud relay. The application targets the configured local service (production port 28485); Chrome's host match pattern is not port-scoped.    |

There is no `tabs` permission request; use of `chrome.tabs` methods is not itself a request for that permission. No cookies/history permission is requested. This does **not** mean page URLs or credentials are never processed.

## Remote code

Proposed answer after final artifact audit: **No remotely hosted executable code.**

Capture functions, UI, SDK dependencies and fonts are bundled. DOI responses, collection records and captured HTML are data, not intended remote extension logic. Diagnostic built-JS checks found no `eval`, `new Function` or literal HTTPS dynamic imports, and generated HTML entrypoints use local assets. Recheck the final ZIP and runtime: new archives are rebuilt with a structural-element allowlist, with script/application-state/resource attributes omitted. A substring scan alone does not prove that data is never executed. Do not certify this from the scan alone.

## User-data category mapping

| Category                                                                   | Assessment for final dashboard review                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website content                                                            | Yes: HTML, PDF content, titles, metadata, selected text and user-authored annotations/notes.                                                                                                                                                                                      |
| Web history                                                                | Disclose URL handling: explicitly captured URLs and optional background visited-page URL queries. Do not answer “no” merely because the Chrome `history` API is unused.                                                                                                           |
| Authentication information                                                 | Connect signed grants/authorization state are handled and locally persisted. Confirm the dashboard's definition and SDK/service handling; document separately from original-site cookies and passwords.                                                                           |
| Personally identifiable information                                        | Check account/collection identifiers, login flow and backend receipt of email/IP information. Source content may also include personal data. Final checkbox requires service-level confirmation.                                                                                  |
| User activity                                                              | Check current definition: selection and invocation events are processed to implement highlights/capture; no general interaction analytics integration was identified in the reviewed extension source. Do not equate absence of an analytics library with no activity processing. |
| Health, financial, communications, location and other sensitive categories | No dedicated feature collecting these was identified. However captured pages/notes and raw embedded state can contain such information. Resolve archive minimization and review Chrome's definitions before deciding applicable boxes.                                            |

Do not use “collects no user data” or “all data stays on the device”. User-selected storage does not remove the need to disclose transfers. The public policy must cover SDK/API/relay traffic as well as extension code.

## Certifications requiring publisher confirmation

- No sale or impermissible transfer of user data.
- No use or transfer for purposes unrelated to the single purpose.
- No use or transfer to determine creditworthiness or for lending purposes.
- Compliance with Chrome Web Store User Data Policy, including Limited Use requirements.

Only affirm the actual wording shown in the dashboard after confirming the operator and service-provider practices. The privacy-policy draft still has blockers and must not be submitted as-is.

Reference: <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>.
