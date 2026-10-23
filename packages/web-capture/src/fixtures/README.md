# Capture fixtures

These small, original HTML pages reproduce structures observed in the public-page
comparison; they do not copy the articles' text. The full fetched corpus stays in
`.scratch/corpus` (gitignored).

- `academic.html`: structures reduced from [Llama 3](https://arxiv.org/html/2407.21783v1)
  and [DeepSeekMath](https://arxiv.org/html/2402.03300v2): short summary paragraphs,
  MathML, table figures, captions, hidden footnotes, and conflicting
  publisher/JSON-LD metadata.
- `code-guide.html`: structures reduced from the
  [Rust Book ownership chapter](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html):
  code inside figures, diagram captions, and ordinary preformatted code.
- `encyclopedia.html`: structures reduced from
  [CRISPR gene editing](https://en.wikipedia.org/wiki/CRISPR_gene_editing):
  Wikipedia-style sections, a data table, and original-format citation anchors.

Tests exercise the final sanitized reading copy, not just raw extractor output.

## Citation replay corpus

`citation-corpus/` contains 21 reduced reproductions observed on public pages on
2026-10-23. It covers the nine site families in
[`citation-claims.md`](../../../../docs/architecture/citation-claims.md), an
additional Guardian agency byline, six scholarly/DOI pages, a personal blog,
an intergovernmental report (IPCC), a Stack Overflow question, a YouTube video,
and an Open Library book edition.

Each directory contains:

- `page.html`: a small **original reproduction**, not a saved article. Retain the
  observed title, citation-related meta tags (including order and duplicates),
  canonical link, HTML language, citation-related JSON-LD structure/values, and
  relevant headline/byline/date wrappers. Omit prose, abstracts/descriptions,
  images, references, styles, SVG, tracking, and executable scripts. Do not fix
  contradictory tags to agree with the expected result. Keep HTML below 20 KB.
- `citoid.json`: the recorded `{ status, body }` response, including errors.
- `doi.json`: the same envelope for DOI content negotiation, when applicable.
  These are raw provider dialects, not pre-converted CSL: some DOI registries
  return Crossref's `journal-article` spelling despite the CSL Accept header.
  Long `abstract`/`abstractNote` values are truncated to their first sentence;
  other response fields are retained. No provider lookup runs during tests.
- `meta.json`: the requested `url`, ISO `retrievedAt`, and `notes` explaining
  capture failures, cataloguing decisions, corroborating sources, and the
  pre-claims extractor's wrong/missing fields at `d0c7061`.
- `expected.json`: hand-reviewed CSL fields, without an id. These describe the
  cited work, **not** whichever source happens to win today. Missing fields
  mean no assertion; they are not a requirement to delete additional fields.

The full fetched HTML, unabridged provider responses, RSS discovery feeds, and
verification API responses stay in gitignored `.scratch/corpus/`. Helpers live
outside those untrusted directories, in `.scratch/tools/`; Python helpers run
with `python3 -I`. Downloads are parsed as data, never executed. Use a
browser-like User-Agent; fetch sequentially and leave at least 1 second between
Wikimedia requests. Citoid requests use `Api-User-Agent: mdbase-reader-corpus`;
DOI requests use `Accept: application/vnd.citationstyles.csl+json`.

A blocked capture must stay a blocked capture. NYT and Stack Overflow returned
403, PeerJ returned a Cloudflare 403 with Citoid 404, and Open Library returned a
200 verification redirect. Their expected records were independently checked
against publisher RSS, the Stack Exchange API, DOI metadata, or Open Library's
edition JSON as detailed in their notes. Do not fabricate successful article
tags for them. An invalid initial Springer URL was excluded and replaced with
a fetchable ImageNet article. These cases test remote recovery, not the ability
to extract unseen page metadata.

The Node-only loader is `src/test/citation-corpus.ts`, relative to this package;
import `loadCitationCorpus()` from there in tests. It resolves fixtures relative
to its module (not the working directory), is deliberately outside the package
exports, and must not be imported by production code. The `test/` location also
makes its `node:fs` dependency explicitly test-only to architecture checks.
`citation-corpus.test.ts` validates all cases and pins an inline before-state
field-match table for `extractScholarlyMetadata`. Case and whitespace are
normalized; date precision, author structure and revision URLs are not. This
baseline is **not** a resolver acceptance test: add separate assertions for the
new claims resolver rather than weakening the hand-reviewed expected records.
