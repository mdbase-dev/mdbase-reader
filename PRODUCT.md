# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Reader is a web application with Capacitor and Electron distributions. The
native packages wrap and adapt the same product rather than establishing a
separate native visual language.

## Users

Reader is for people who read, annotate, organise, and cite source material as
part of sustained research or writing. They work across PDFs, EPUBs, saved web
pages, source notes, and bibliographic metadata, often returning to the same
material over a long period.

## Product Purpose

Reader makes an mdbase collection into a durable reading library. Success means
a user can add or capture a source, read it fluently, create a precise portable
annotation, find that annotation in the source note, and reuse the result in
other mdbase tools without proprietary lock-in.

## Positioning

Reader's source records, annotations, selectors, reading state, CSL-JSON, and
files remain first-class mdbase data. The bespoke reading experience operates
directly on the user's collection rather than hiding it behind an application
database or export step.

## Operating Context

Users connect an existing or new mdbase collection, browse source records,
open current files, read and annotate documents, edit Markdown source
notes, enrich citation data when useful, search their library, and export or
materialise their work. A collection may be hosted or owned by a user's
computer, and connectivity can be intermittent.

## Capabilities and Constraints

- The primary representations are PDF, EPUB, and safe archived HTML.
- Source and annotation contracts are the initial collection boundary.
- Bibliographic metadata follows CSL-JSON but remains optional.
- Reading opens the current file by stable identity, even when its bytes change.
  Annotations retain the revision they targeted; silent substitution of a
  different file or an uncertain annotation location is not acceptable.
- Reading must remain available while indexing, enrichment, or note hydration
  proceeds independently.
- The web app uses mdbase Connect; Capacitor and Electron provide platform
  adapters rather than business logic.

## Brand Commitments

The product is named **mdbase Reader** and belongs to the existing mdbase
product family. It must use the mdbase visual language defined by
`mdbase-connect`: high-legibility typography, precise structure, restrained
colour, and the existing mdbase mark. The user has explicitly asked for a
clean, minimal, beautiful, polished operating interface.

## Evidence on Hand

- `/home/calluma/testvault/mdbase-reader` is a real connected literature
  collection used for performance and end-to-end testing.
- The existing Reader preview provides representative source and annotation
  content but is not evidence of finished behavior.
- No testimonials, commercial claims, or public performance benchmarks are
  available and none should be invented.

## Product Principles

1. The reading surface receives developer and performance priority.
2. User data stays portable, inspectable, and revision-safe.
3. Reading is immediate; secondary metadata work never blocks the document.
4. Bibliographic rigour is available without being compulsory.
5. Authorization remains narrow and consequences remain reviewable.

## Accessibility & Inclusion

Reader targets WCAG 2.2 AA for its controls and reading surfaces. It requires
complete keyboard access, visible focus, semantic navigation and status,
non-colour-only states, adjustable reflowable typography, reduced motion,
light/dark/high-contrast support, appropriate touch targets, and accessible
annotation creation and navigation.
