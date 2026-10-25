import { deviceThumbnailStore, type ThumbnailStore } from "./thumbnail-store.js";

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

/** A thumbnail ready to show, as the hook hands it to a card. */
export interface SourceThumbnail {
  readonly url: string;
  /** The PDF's page count, learned while rendering its page. */
  readonly pageCount?: number;
}

/** A loaded thumbnail image. Each mounted card makes and releases its own object URL. */
export interface LoadedThumbnail {
  readonly image: Blob;
  readonly pageCount?: number;
}

export type ThumbnailFileReader = (
  file: string,
  expectedRevision?: FileRevision,
  options?: CollectionFileReadOptions,
) => Promise<ExportedCollectionFile>;

export type ThumbnailLoader = (
  plan: SourceThumbnailPlan,
  readFile: ThumbnailFileReader,
  signal?: AbortSignal,
) => Promise<LoadedThumbnail | null>;

export interface ThumbnailRenderers {
  readonly renderPdfPage: (
    bytes: Uint8Array,
    pageIndex: number,
    width: number,
    signal: AbortSignal,
  ) => Promise<{ readonly image: Blob; readonly pageCount: number }>;
  readonly readEpubCover: (bytes: Uint8Array, signal: AbortSignal) => Promise<Blob | null>;
  /** Scales an image down to `width` pixels across, or returns it as it is where it cannot. */
  readonly shrinkImage: (image: Blob, width: number) => Promise<Blob>;
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

interface PendingThumbnail {
  readonly promise: Promise<LoadedThumbnail | null>;
  readonly controller: AbortController;
  waiters: number;
}

/** What one attempt learned, and whether it holds for this revision of the file. */
interface ThumbnailOutcome {
  readonly thumbnail: LoadedThumbnail | null;
  /** Kept on this device: a rendered image, no cover, or a file over the download limit. */
  readonly persist: boolean;
}

/**
 * Loads thumbnails one at a time. A device store is checked before any download and keeps
 * each rendered image, so a file is read and rendered once per revision rather than once per
 * session. The newest few results also stay in memory.
 *
 * Only real answers are remembered. A failed read (offline, signed out, the file moved) is
 * not, so a later mount tries again; work every caller has abandoned is cancelled.
 */
export function createThumbnailLoader(
  renderers: ThumbnailRenderers,
  options: { readonly store?: ThumbnailStore | undefined; readonly cacheSize?: number } = {},
): ThumbnailLoader {
  const { store, cacheSize = 12 } = options;
  const settled = new Map<string, LoadedThumbnail | null>();
  const pending = new Map<string, PendingThumbnail>();
  let queue: Promise<unknown> = Promise.resolve();

  const remember = (key: string, thumbnail: LoadedThumbnail | null): void => {
    settled.delete(key);
    settled.set(key, thumbnail);
    for (const oldest of settled.keys()) {
      if (settled.size <= cacheSize) {
        break;
      }
      settled.delete(oldest);
    }
  };

  const produce = async (
    key: string,
    plan: SourceThumbnailPlan,
    readFile: ThumbnailFileReader,
    signal: AbortSignal,
  ): Promise<ThumbnailOutcome> => {
    signal.throwIfAborted();
    const stored = await store?.get(key).catch(() => undefined);
    if (stored) {
      return { thumbnail: loaded(stored.image, stored.pageCount), persist: false };
    }
    signal.throwIfAborted();
    const outcome = await render(plan, readFile, renderers, signal);
    if (outcome.persist) {
      void store
        ?.put(key, {
          image: outcome.thumbnail?.image ?? null,
          ...(outcome.thumbnail?.pageCount === undefined
            ? {}
            : { pageCount: outcome.thumbnail.pageCount }),
        })
        .catch(() => undefined);
    }
    return outcome;
  };

  return (plan, readFile, signal) => {
    if (signal?.aborted) {
      return Promise.reject(signal.reason as Error);
    }
    const key = thumbnailKey(plan);
    if (settled.has(key)) {
      const thumbnail = settled.get(key) ?? null;
      // Most recently used last, so eviction takes the oldest.
      remember(key, thumbnail);
      return Promise.resolve(thumbnail);
    }
    let job = pending.get(key);
    if (!job) {
      const controller = new AbortController();
      const promise = queue
        .then(() => produce(key, plan, readFile, controller.signal))
        .then(({ thumbnail }) => {
          remember(key, thumbnail);
          return thumbnail;
        })
        .finally(() => {
          if (pending.get(key) === job) {
            pending.delete(key);
          }
        });
      queue = promise.catch(() => undefined);
      job = { promise, controller, waiters: 0 };
      pending.set(key, job);
    }
    return join(key, job, pending, signal);
  };
}

/** One caller's view of shared work: its own abort leaves, and the last one out cancels. */
function join(
  key: string,
  job: PendingThumbnail,
  pending: Map<string, PendingThumbnail>,
  signal: AbortSignal | undefined,
): Promise<LoadedThumbnail | null> {
  job.waiters += 1;
  if (!signal) {
    return job.promise;
  }
  return new Promise((resolve, reject) => {
    const leave = (): void => {
      job.waiters -= 1;
      if (job.waiters === 0) {
        if (pending.get(key) === job) {
          pending.delete(key);
        }
        job.controller.abort(signal.reason);
      }
      reject(signal.reason as Error);
    };
    signal.addEventListener("abort", leave, { once: true });
    job.promise.finally(() => signal.removeEventListener("abort", leave)).then(resolve, reject);
  });
}

async function render(
  plan: SourceThumbnailPlan,
  readFile: ThumbnailFileReader,
  renderers: ThumbnailRenderers,
  signal: AbortSignal,
): Promise<ThumbnailOutcome> {
  let file: ExportedCollectionFile;
  try {
    file = await readFile(plan.document.file, plan.document.revision, {
      maxBytes: thumbnailByteLimits[plan.kind],
      signal,
    });
  } catch (reason) {
    if (!signal.aborted && isTooLarge(reason)) {
      return { thumbnail: null, persist: true };
    }
    throw reason;
  }
  signal.throwIfAborted();
  try {
    if (plan.kind === "image") {
      const image = new Blob([file.bytes as Uint8Array<ArrayBuffer>], {
        type: file.mediaType || plan.document.mediaType,
      });
      return {
        thumbnail: loaded(await renderers.shrinkImage(image, thumbnailWidth)),
        persist: true,
      };
    }
    if (plan.kind === "pdf") {
      const { image, pageCount } = await renderers.renderPdfPage(
        file.bytes,
        plan.pageIndex,
        thumbnailWidth,
        signal,
      );
      return { thumbnail: loaded(image, pageCount), persist: true };
    }
    const cover = await renderers.readEpubCover(file.bytes, signal);
    return {
      thumbnail: cover ? loaded(await renderers.shrinkImage(cover, thumbnailWidth)) : null,
      persist: true,
    };
  } catch (reason) {
    if (signal.aborted) {
      throw reason;
    }
    // The file arrived but would not render. Keep that for this session only: a later
    // version of the renderer may manage it.
    return { thumbnail: null, persist: false };
  }
}

function loaded(image: Blob | null, pageCount?: number): LoadedThumbnail | null {
  return image ? { image, ...(pageCount === undefined ? {} : { pageCount }) } : null;
}

/** Connect refuses a file over `maxBytes` before downloading it, with this code. */
function isTooLarge(reason: unknown): boolean {
  return reason instanceof Error && /\bfile_too_large\b/u.test(reason.message);
}

/**
 * Draws an image `width` pixels across as WebP (PNG where WebP cannot be encoded). An image
 * already that small, or a browser without OffscreenCanvas, keeps the original.
 */
export async function shrinkImage(image: Blob, width: number): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return image;
  }
  const bitmap = await createImageBitmap(image);
  try {
    if (bitmap.width <= width) {
      return image;
    }
    const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) {
      return image;
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const small = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
    return small.size < image.size ? small : image;
  } finally {
    bitmap.close();
  }
}

/** The app's loader: PDFium and the EPUB reader load only when a thumbnail is first wanted. */
export const loadSourceThumbnail: ThumbnailLoader = createThumbnailLoader(
  {
    renderPdfPage: async (bytes, pageIndex, width, signal) => {
      const { renderPdfPagePreview } = await import("@mdbase-reader/renderer-pdf/details");
      return renderPdfPagePreview(bytes, { pageIndex, width, signal });
    },
    readEpubCover: async (bytes, signal) => {
      const { readEpubCover } = await import("@mdbase-reader/renderer-epub/details");
      return readEpubCover(bytes, { signal });
    },
    shrinkImage,
  },
  { store: deviceThumbnailStore() },
);
