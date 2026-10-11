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
