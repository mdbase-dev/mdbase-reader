# Store listing draft

Status: draft for approval. Do not upload until the readiness gates are closed.

## Name

mdbase Reader

## Short description

Save articles and PDFs to mdbase, highlight passages, and revisit your reading notes.

This is proposed listing copy. Chrome takes the summary from the package manifest's `description`; update that separately if this wording is approved. Current manifest: “Save the page you are reading and revisit your mdbase annotations.”

## Full description

Keep the pages you read together with your highlights and notes.

mdbase Reader lets you save supported HTTPS articles and PDFs to an authorized mdbase collection, directly from Chrome. Open the side panel to check the title and available citation metadata, choose your collection, add tags or a note, and explicitly save the source.

• Save a readable article copy and a page archive to your collection.
• Save supported PDFs for reading in mdbase Reader.
• Highlight text on web articles with colours, tags and comments.
• Keep the side panel open to save successive passages as you read.
• Preview citation metadata from the page or a DOI lookup when available.
• Optionally recognize saved pages and display your saved article highlights when you revisit them.
• Open your saved sources in the mdbase Reader web app.

Requires mdbase Connect and access to an authorized collection. This extension is a companion to mdbase Reader, not a standalone storage service. Availability depends on your collection and connection. For a collection served from your computer, direct local access is optional and requires additional browser permission.

By default, page capture uses temporary access after you invoke the extension. The optional saved-page feature requests HTTPS website access and checks visited page addresses against your selected collection. DOI citation previews contact the DOI service when a DOI is available. Saved content is transferred through mdbase Connect to your collection.

Chrome internal pages, the Chrome Web Store and other restricted pages cannot be captured. Some websites and PDFs may not support capture; download and import a PDF in Reader if browser capture is unavailable. PDF text highlighting is done in Reader, not through the extension's web-page selection feature.

## Listing fields to confirm

| Field                          | Proposed value / action                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Category                       | Productivity, or closest current dashboard category                                             |
| Language                       | English; select the actual supported English locale                                             |
| Homepage                       | `https://mdbase-reader.pages.dev/` (current production configuration; verify public onboarding) |
| Support URL                    | TODO: confirmed public issue/support page; do not assume repository visibility                  |
| Privacy URL                    | TODO: publish approved privacy policy at a stable public URL                                    |
| Support/privacy contact        | TODO: publisher-approved address                                                                |
| Pricing / account requirements | TODO: confirm any service fees, eligibility or access restrictions and disclose them            |
| Visibility / regions           | Publisher decision; do not submit or change distribution during preparation                     |

## Artwork brief

Per Chrome's image guidance: 128×128 extension icon; at least one (up to five) 1280×800 or 640×400 screenshots; required 440×280 small promotional tile; optional 1400×560 marquee. Prefer 1280×800 screenshots, full bleed, square corners, no padding. Recheck upload constraints in the current dashboard.

Existing icon: `apps/extension/public/icons/icon-128.png`. Visually verify before upload.

Create three genuine screenshots from the release candidate using only demo data:

1. **Save an article** — public article beside the side panel, visible title, collection and save control.
2. **Highlight as you read** — selected public text with colour, comment and tags in the panel.
3. **Find saved highlights again** — saved-page marks/highlights with the feature enabled; label the feature as optional.

Optional fourth: a supported public PDF ready to save. Do not show unsupported PDF selection highlighting.

Small promotional tile: mdbase mark, “mdbase Reader”, “Save. Highlight. Revisit.” Ensure text remains legible at small size. Do not use personal vault content, browser account information, fake review stars, or an image implying features not in the submitted build.

No new screenshot or promotional asset was produced during this initial audit.
