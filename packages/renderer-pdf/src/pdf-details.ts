import type { PdfEngine } from "@embedpdf/models";

/** The viewer loads PDFium from here too, so the browser's cached copy is shared. */
export const PDFIUM_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@2.15.0/dist/pdfium.wasm";

export interface PdfDetails {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: string;
  /** Text of the opening pages, where DOIs and arXiv stamps are printed. */
  readonly openingText: string;
}

export interface PdfDetailsOptions {
  readonly signal?: AbortSignal;
  /** How many opening pages to read; two covers title pages and first-page footers. */
  readonly pages?: number;
  readonly engine?: () => Promise<PdfEngine>;
}

let sharedEngine: Promise<PdfEngine> | null = null;

/**
 * Reads a PDF's document information and opening text without a viewer, for suggesting a title
 * and finding identifiers before import. PDFium runs on the main thread and loads on first use.
 */
export async function readPdfDetails(
  bytes: Uint8Array,
  options: PdfDetailsOptions = {},
): Promise<PdfDetails> {
  const engine = await (options.engine ?? defaultEngine)();
  options.signal?.throwIfAborted();
  const content = bytes.slice().buffer;
  const document = await engine
    .openDocumentBuffer({ id: `details-${String(Date.now())}`, content })
    .toPromise();
  try {
    const metadata = await engine.getMetadata(document).toPromise();
    options.signal?.throwIfAborted();
    const pages = Array.from(
      { length: Math.min(options.pages ?? 2, document.pageCount) },
      (_, index) => index,
    );
    const openingText = pages.length ? await engine.extractText(document, pages).toPromise() : "";
    return {
      ...present("title", metadata.title),
      ...present("author", metadata.author),
      ...present("subject", metadata.subject),
      ...present("keywords", metadata.keywords),
      openingText,
    };
  } finally {
    await engine
      .closeDocument(document)
      .toPromise()
      .catch(() => false);
  }
}

function defaultEngine(): Promise<PdfEngine> {
  sharedEngine ??= import("@embedpdf/engines/pdfium-direct-engine")
    .then(({ createPdfiumEngine }) =>
      // No font fallback: only text extraction is needed, never rendering.
      createPdfiumEngine(PDFIUM_WASM_URL, { fontFallback: null }),
    )
    .catch((reason: unknown) => {
      sharedEngine = null;
      throw reason;
    });
  return sharedEngine;
}

function present<Key extends string>(
  key: Key,
  value: string | null | undefined,
): Partial<Record<Key, string>> {
  const text = value?.replace(/\s+/gu, " ").trim();
  return text ? ({ [key]: text } as Partial<Record<Key, string>>) : {};
}
