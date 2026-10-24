import {
  collectionId,
  fileId,
  fileRevision,
  sourceId,
  type DocumentDescriptor,
  type SourceSummary,
} from "@mdbase-reader/core";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

import {
  createThumbnailLoader,
  sourceThumbnailPlan,
  thumbnailByteLimits,
  thumbnailKey,
  thumbnailWidth,
  type ThumbnailFileReader,
  type ThumbnailRenderers,
} from "./source-thumbnail.js";
import {
  IndexedDbThumbnailStore,
  type StoredThumbnail,
  type ThumbnailStore,
} from "./thumbnail-store.js";

function document(
  file: string,
  mediaType: string,
  extra: Partial<DocumentDescriptor> = {},
): DocumentDescriptor {
  return {
    fileId: fileId(file),
    file: `[[${file}]]`,
    mediaType,
    revision: fileRevision(`sha256:${"b".repeat(64)}`),
    role: "primary",
    ...extra,
  };
}

function source(documents: readonly DocumentDescriptor[]): SourceSummary {
  return {
    collectionId: collectionId("test"),
    id: sourceId("s"),
    path: "s.md",
    title: "S",
    creators: [],
    tags: [],
    documents,
  };
}

const pdf = document("paper.pdf", "application/pdf");

describe("sourceThumbnailPlan", () => {
  it("prefers an attached cover image, then a PDF page, then an EPUB's cover", () => {
    const cover = document("cover.jpg", "image/jpeg", { role: "cover" });
    expect(sourceThumbnailPlan(source([pdf, cover]))).toEqual({ kind: "image", document: cover });
    expect(sourceThumbnailPlan(source([pdf]))).toEqual({
      kind: "pdf",
      document: pdf,
      pageIndex: 0,
    });
    const epub = document("book.epub", "application/epub+zip");
    expect(sourceThumbnailPlan(source([epub]))).toEqual({ kind: "epub", document: epub });
  });

  it("starts a PDF chapter at its own first page", () => {
    const chapter = document("book.pdf", "application/pdf", {
      range: { kind: "pages", start: 270, end: 324 },
    });
    expect(sourceThumbnailPlan(source([chapter]))).toMatchObject({ kind: "pdf", pageIndex: 270 });
  });

  it("has no thumbnail for saved web pages or sources without a file", () => {
    expect(sourceThumbnailPlan(source([document("page.html", "text/html")]))).toBeNull();
    expect(sourceThumbnailPlan(source([]))).toBeNull();
  });
});

describe("createThumbnailLoader", () => {
  function setup(): {
    readonly renderers: ThumbnailRenderers & {
      readonly renderPdfPage: ReturnType<typeof vi.fn>;
    };
    readonly readFile: ReturnType<typeof vi.fn> & ThumbnailFileReader;
    readonly store: ThumbnailStore & {
      readonly entries: Map<string, StoredThumbnail>;
      readonly put: ReturnType<typeof vi.fn>;
    };
  } {
    const renderers = {
      renderPdfPage: vi.fn(
        (_bytes: Uint8Array, _page: number, _width: number, _signal: AbortSignal) =>
          Promise.resolve({ image: new Blob(["png"]), pageCount: 11 }),
      ),
      readEpubCover: vi.fn((_bytes: Uint8Array, _signal: AbortSignal) =>
        Promise.resolve<Blob | null>(null),
      ),
      shrinkImage: vi.fn((image: Blob) => Promise.resolve(image)),
    };
    const readFile = vi.fn((file: string) =>
      Promise.resolve({ path: file, mediaType: "application/pdf", bytes: new Uint8Array([1]) }),
    ) as ReturnType<typeof vi.fn> & ThumbnailFileReader;
    const entries = new Map<string, StoredThumbnail>();
    const store = {
      entries,
      get: vi.fn((key: string) => Promise.resolve(entries.get(key))),
      put: vi.fn((key: string, value: StoredThumbnail) => {
        entries.set(key, value);
        return Promise.resolve();
      }),
    };
    return { renderers, readFile, store };
  }

  const plan = { kind: "pdf" as const, document: pdf, pageIndex: 0 };

  it("downloads within a size limit, renders small, and never repeats the work", async () => {
    const { renderers, readFile } = setup();
    const load = createThumbnailLoader(renderers);
    const first = await load(plan, readFile);
    const second = await load(plan, readFile);
    expect(first).toEqual({ image: expect.any(Blob), pageCount: 11 });
    expect(second).toBe(first);
    expect(readFile).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledWith(pdf.file, pdf.revision, {
      maxBytes: thumbnailByteLimits.pdf,
      signal: expect.any(AbortSignal),
    });
    expect(renderers.renderPdfPage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      0,
      thumbnailWidth,
      expect.any(AbortSignal),
    );
  });

  it("keeps the rendered image on the device and reads it before any download", async () => {
    const { renderers, readFile, store } = setup();
    await createThumbnailLoader(renderers, { store })(plan, readFile);
    expect([...store.entries.keys()]).toEqual([thumbnailKey(plan)]);

    // A new session: an empty memory cache, the same device store.
    const later = await createThumbnailLoader(renderers, { store })(plan, readFile);
    expect(later).toEqual({ image: expect.any(Blob), pageCount: 11 });
    expect(readFile).toHaveBeenCalledOnce();
  });

  it("remembers genuine negatives: no cover, or a file over the download limit", async () => {
    const { renderers, readFile, store } = setup();
    const epub = { kind: "epub" as const, document: document("book.epub", "application/epub+zip") };
    const load = createThumbnailLoader(renderers, { store });
    await expect(load(epub, readFile)).resolves.toBeNull();
    await expect(load(epub, readFile)).resolves.toBeNull();
    readFile.mockRejectedValueOnce(new Error("mdbase Connect could not read file: file_too_large"));
    await expect(load(plan, readFile)).resolves.toBeNull();
    await expect(load(plan, readFile)).resolves.toBeNull();
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(store.entries.get(thumbnailKey(plan))).toEqual({ image: null });
  });

  it("forgets a failed read so a later mount tries again", async () => {
    const { renderers, readFile, store } = setup();
    readFile.mockRejectedValueOnce(new Error("Network unavailable."));
    const load = createThumbnailLoader(renderers, { store });
    await expect(load(plan, readFile)).rejects.toThrow("Network unavailable.");
    expect(store.put).not.toHaveBeenCalled();
    await expect(load(plan, readFile)).resolves.toEqual({
      image: expect.any(Blob),
      pageCount: 11,
    });
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it("cancels the download once every caller has gone", async () => {
    const { renderers, store } = setup();
    let readSignal: AbortSignal | undefined;
    const readFile = vi.fn(
      (_file: string, _revision?: unknown, options?: { readonly signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          readSignal = options?.signal;
          readSignal?.addEventListener("abort", () => reject(new Error("Aborted.")));
        }),
    ) as ReturnType<typeof vi.fn> & ThumbnailFileReader;
    const load = createThumbnailLoader(renderers, { store });
    const first = new AbortController();
    const second = new AbortController();
    const firstLoad = load(plan, readFile, first.signal);
    const secondLoad = load(plan, readFile, second.signal);
    await vi.waitFor(() => expect(readSignal).toBeDefined());
    first.abort(new Error("Unmounted."));
    await expect(firstLoad).rejects.toThrow("Unmounted.");
    expect(readSignal?.aborted).toBe(false);
    second.abort(new Error("Unmounted."));
    await expect(secondLoad).rejects.toThrow("Unmounted.");
    expect(readSignal?.aborted).toBe(true);
    expect(store.put).not.toHaveBeenCalled();
  });
});

describe("IndexedDbThumbnailStore", () => {
  it("round-trips images and negatives, and drops the oldest past its limit", async () => {
    const store = new IndexedDbThumbnailStore(new IDBFactory(), 2);
    await store.put("a", { image: new Blob(["one"], { type: "image/png" }), pageCount: 3 });
    const stored = await store.get("a");
    expect(stored?.pageCount).toBe(3);
    expect(stored?.image?.type).toBe("image/png");
    expect(await stored?.image?.text()).toBe("one");
    await new Promise((resolve) => setTimeout(resolve, 2));
    await store.put("b", { image: null });
    expect(await store.get("b")).toEqual({ image: null });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await store.put("c", { image: null });
    expect(await store.get("a")).toBeUndefined();
    expect(await store.get("c")).toEqual({ image: null });
  });
});
