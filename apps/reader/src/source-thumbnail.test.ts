import {
  collectionId,
  fileId,
  fileRevision,
  sourceId,
  type DocumentDescriptor,
  type SourceSummary,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import {
  createThumbnailLoader,
  sourceThumbnailPlan,
  thumbnailByteLimits,
  thumbnailWidth,
  type ThumbnailFileReader,
  type ThumbnailRenderers,
} from "./source-thumbnail.js";

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
      readonly revokeObjectUrl: ReturnType<typeof vi.fn>;
    };
    readonly readFile: ReturnType<typeof vi.fn> & ThumbnailFileReader;
  } {
    let next = 0;
    const renderers = {
      renderPdfPage: vi.fn((_bytes: Uint8Array, _page: number, _width: number) =>
        Promise.resolve({ image: new Blob(["png"]), pageCount: 11 }),
      ),
      readEpubCover: vi.fn(() => Promise.resolve(null)),
      objectUrl: vi.fn(() => `blob:${String((next += 1))}`),
      revokeObjectUrl: vi.fn(),
    };
    const readFile = vi.fn((file: string) =>
      Promise.resolve({ path: file, mediaType: "application/pdf", bytes: new Uint8Array([1]) }),
    ) as ReturnType<typeof vi.fn> & ThumbnailFileReader;
    return { renderers, readFile };
  }

  it("downloads within a size limit, renders small, and never repeats the work", async () => {
    const { renderers, readFile } = setup();
    const load = createThumbnailLoader(renderers);
    const plan = { kind: "pdf" as const, document: pdf, pageIndex: 0 };
    const first = await load(plan, readFile);
    const second = await load(plan, readFile);
    expect(first).toEqual({ url: "blob:1", pageCount: 11 });
    expect(second).toBe(first);
    expect(readFile).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledWith(pdf.file, pdf.revision, {
      maxBytes: thumbnailByteLimits.pdf,
    });
    expect(renderers.renderPdfPage).toHaveBeenCalledWith(expect.any(Uint8Array), 0, thumbnailWidth);
  });

  it("remembers a failure as no thumbnail instead of retrying on every render", async () => {
    const { renderers, readFile } = setup();
    readFile.mockRejectedValueOnce(new Error("File is larger than the limit."));
    const load = createThumbnailLoader(renderers);
    const plan = { kind: "pdf" as const, document: pdf, pageIndex: 0 };
    await expect(load(plan, readFile)).resolves.toBeNull();
    await expect(load(plan, readFile)).resolves.toBeNull();
    expect(readFile).toHaveBeenCalledOnce();
  });

  it("releases the oldest image once more than its cache size are held", async () => {
    const { renderers, readFile } = setup();
    const load = createThumbnailLoader(renderers, 2);
    for (const pageIndex of [0, 1, 2]) {
      await load({ kind: "pdf", document: pdf, pageIndex }, readFile);
    }
    await Promise.resolve();
    expect(renderers.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:1");
  });
});
