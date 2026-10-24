import { PdfActionType, type PdfBookmarkObject, type PdfEngine } from "@embedpdf/models";

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

export async function readPdfChapterOutline(
  bytes: Uint8Array,
  options: PdfDetailsOptions = {},
): Promise<{
  readonly pageCount: number;
  readonly entries: readonly {
    readonly title: string;
    readonly level: number;
    readonly pageIndex?: number;
  }[];
}> {
  const engine = await (options.engine ?? defaultEngine)();
  options.signal?.throwIfAborted();
  const document = await engine
    .openDocumentBuffer({ id: `outline-${crypto.randomUUID()}`, content: bytes.slice().buffer })
    .toPromise();
  try {
    const bookmarks = await engine.getBookmarks(document).toPromise();
    options.signal?.throwIfAborted();
    const flatten = (
      items: readonly PdfBookmarkObject[],
      level: number,
    ): { title: string; level: number; pageIndex?: number }[] =>
      items.flatMap((item) => {
        const target = item.target;
        const destination =
          target?.type === "destination"
            ? target.destination
            : target?.type === "action" && target.action.type === PdfActionType.Goto
              ? target.action.destination
              : undefined;
        return [
          {
            title: item.title,
            level,
            ...(destination ? { pageIndex: destination.pageIndex } : {}),
          },
          ...flatten(item.children ?? [], level + 1),
        ];
      });
    return { pageCount: document.pageCount, entries: flatten(bookmarks.bookmarks, 0) };
  } finally {
    await engine
      .closeDocument(document)
      .toPromise()
      .catch(() => false);
  }
}

export interface PdfPagePreview {
  readonly image: Blob;
  readonly pageCount: number;
}

/**
 * Renders one page small, for a library thumbnail, without a viewer. The page is drawn at
 * `width` device pixels wide; a missing page falls back to the first.
 */
export async function renderPdfPagePreview(
  bytes: Uint8Array,
  options: PdfDetailsOptions & { readonly pageIndex?: number; readonly width: number },
): Promise<PdfPagePreview> {
  const engine = await (options.engine ?? defaultEngine)();
  options.signal?.throwIfAborted();
  const document = await engine
    .openDocumentBuffer({ id: `preview-${crypto.randomUUID()}`, content: wholeBuffer(bytes) })
    .toPromise();
  try {
    const page = document.pages[options.pageIndex ?? 0] ?? document.pages[0];
    if (!page) {
      throw new Error("This PDF has no pages.");
    }
    options.signal?.throwIfAborted();
    const image = await engine
      .renderPage(document, page, {
        scaleFactor: options.width / Math.max(1, page.size.width),
        // Every browser encodes PNG; at thumbnail size it is only a few kilobytes.
        imageType: "image/png",
      })
      .toPromise();
    return { image, pageCount: document.pageCount };
  } finally {
    await engine
      .closeDocument(document)
      .toPromise()
      .catch(() => false);
  }
}

/**
 * The bytes' own buffer when they span all of it, else a copy. The direct engine copies the
 * content into PDFium's heap and never detaches it, so the caller's bytes stay usable.
 */
function wholeBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer } = bytes;
  return buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === buffer.byteLength
    ? buffer
    : bytes.slice().buffer;
}

function defaultEngine(): Promise<PdfEngine> {
  sharedEngine ??= import("@embedpdf/engines/pdfium-direct-engine")
    .then(({ createPdfiumEngine }) =>
      // No font fallback: text extraction needs none, and a thumbnail is too small for a
      // substituted face to matter, so this engine never fetches fonts.
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
