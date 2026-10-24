import type {
  CollectionFileReadOptions,
  DocumentDescriptor,
  ExportedCollectionFile,
  FileRevision,
  SourceSummary,
} from "@mdbase-reader/core";

/**
 * Where a source's thumbnail comes from: an attached cover image, a PDF page (a chapter's
 * first page, else the file's first), or an EPUB's cover. Saved web pages and notes have none
 * and show a typographic placeholder instead.
 */
export type SourceThumbnailPlan =
  | { readonly kind: "image"; readonly document: DocumentDescriptor }
  | { readonly kind: "pdf"; readonly document: DocumentDescriptor; readonly pageIndex: number }
  | { readonly kind: "epub"; readonly document: DocumentDescriptor };

export interface SourceThumbnail {
  readonly url: string;
  /** The PDF's page count, learned while rendering its page. */
  readonly pageCount?: number;
}

export type ThumbnailFileReader = (
  file: string,
  expectedRevision?: FileRevision,
  options?: CollectionFileReadOptions,
) => Promise<ExportedCollectionFile>;

export interface ThumbnailRenderers {
  readonly renderPdfPage: (
    bytes: Uint8Array,
    pageIndex: number,
    width: number,
  ) => Promise<{ readonly image: Blob; readonly pageCount: number }>;
  readonly readEpubCover: (bytes: Uint8Array) => Promise<Blob | null>;
  readonly objectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
}

/** Files larger than these are not downloaded for a thumbnail; the placeholder stands in. */
export const thumbnailByteLimits = {
  image: 4 * 1024 * 1024,
  pdf: 32 * 1024 * 1024,
  epub: 48 * 1024 * 1024,
} as const;

/** Device pixels across: twice the card's 76px thumbnail, for sharp high-density screens. */
export const thumbnailWidth = 160;

export function sourceThumbnailPlan(source: SourceSummary): SourceThumbnailPlan | null {
  const cover = source.documents.find(
    (document) => document.role === "cover" && document.mediaType.startsWith("image/"),
  );
  if (cover) {
    return { kind: "image", document: cover };
  }
  const readable = source.documents.filter((document) => document.role !== "cover");
  const document = readable.find(({ role }) => role === "primary") ?? readable[0];
  if (document?.mediaType === "application/pdf") {
    return {
      kind: "pdf",
      document,
      pageIndex: document.range?.kind === "pages" ? Math.max(0, document.range.start) : 0,
    };
  }
  if (document?.mediaType === "application/epub+zip") {
    return { kind: "epub", document };
  }
  return null;
}

export function thumbnailKey(plan: SourceThumbnailPlan): string {
  const { file, revision } = plan.document;
  return `${plan.kind}:${file}@${revision}${plan.kind === "pdf" ? `#${String(plan.pageIndex)}` : ""}`;
}

/**
 * Loads thumbnails one at a time and remembers the newest few, including failures, so a
 * library re-render never downloads or renders the same file twice. Evicted images are
 * released.
 */
export function createThumbnailLoader(
  renderers: ThumbnailRenderers,
  cacheSize = 12,
): (plan: SourceThumbnailPlan, readFile: ThumbnailFileReader) => Promise<SourceThumbnail | null> {
  const cache = new Map<string, Promise<SourceThumbnail | null>>();
  let queue: Promise<unknown> = Promise.resolve();
  return (plan, readFile) => {
    const key = thumbnailKey(plan);
    const cached = cache.get(key);
    if (cached) {
      // Most recently used last, so eviction takes the oldest.
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    const task = queue.then(() => loadThumbnail(plan, readFile, renderers)).catch(() => null);
    queue = task;
    cache.set(key, task);
    for (const [oldest, value] of cache) {
      if (cache.size <= cacheSize) {
        break;
      }
      cache.delete(oldest);
      void value.then((thumbnail) => thumbnail && renderers.revokeObjectUrl(thumbnail.url));
    }
    return task;
  };
}

async function loadThumbnail(
  plan: SourceThumbnailPlan,
  readFile: ThumbnailFileReader,
  renderers: ThumbnailRenderers,
): Promise<SourceThumbnail | null> {
  const { bytes, mediaType } = await readFile(plan.document.file, plan.document.revision, {
    maxBytes: thumbnailByteLimits[plan.kind],
  });
  if (plan.kind === "image") {
    return {
      url: renderers.objectUrl(
        new Blob([bytes.slice().buffer], { type: mediaType || plan.document.mediaType }),
      ),
    };
  }
  if (plan.kind === "pdf") {
    const { image, pageCount } = await renderers.renderPdfPage(
      bytes,
      plan.pageIndex,
      thumbnailWidth,
    );
    return { url: renderers.objectUrl(image), pageCount };
  }
  const cover = await renderers.readEpubCover(bytes);
  return cover ? { url: renderers.objectUrl(cover) } : null;
}

/** The app's loader: PDFium and the EPUB reader load only when a thumbnail is first wanted. */
export const loadSourceThumbnail = createThumbnailLoader({
  renderPdfPage: async (bytes, pageIndex, width) => {
    const { renderPdfPagePreview } = await import("@mdbase-reader/renderer-pdf/details");
    return renderPdfPagePreview(bytes, { pageIndex, width });
  },
  readEpubCover: async (bytes) => {
    const { readEpubCover } = await import("@mdbase-reader/renderer-epub/details");
    return readEpubCover(bytes);
  },
  objectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
});
