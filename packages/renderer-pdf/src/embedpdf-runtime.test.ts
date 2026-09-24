import { annotationId, collectionId, dateTime } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { extractPdfDocumentText, textSelectionToDraft } from "./embedpdf-runtime.js";
import { createPdfDecorationController } from "./pdf-decoration-controller.js";

import type { PdfAnnotationObject, PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import type { AnnotationEvent, AnnotationTransferItem } from "@embedpdf/plugin-annotation";
import type { Annotation } from "@mdbase-reader/core";

describe("EmbedPDF selection mapping", () => {
  it("preserves selected text and labels top-left renderer geometry explicitly", () => {
    expect(
      textSelectionToDraft(
        ["exact  text"],
        [
          {
            pageIndex: 2,
            rect: { origin: { x: 10, y: 20 }, size: { width: 30, height: 8 } },
            segmentRects: [{ origin: { x: 10, y: 20 }, size: { width: 30, height: 8 } }],
          },
        ],
      ),
    ).toEqual({
      target: {
        quote: { exact: "exact  text" },
        pdf: {
          pageIndex: 2,
          coordinateSpace: {
            profile: "embedpdf-selection-page-points-v1",
            box: "crop",
            origin: "top_left",
          },
          quadPoints: [[10, 20, 40, 20, 10, 28, 40, 28]],
        },
      },
      locator: { kind: "pdf", pageIndex: 2 },
    });
  });

  it("keeps multi-page selections quote-addressable without false geometry", () => {
    const rect = { origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } };
    expect(
      textSelectionToDraft(
        ["first", "second"],
        [
          { pageIndex: 2, rect, segmentRects: [rect] },
          { pageIndex: 3, rect, segmentRects: [rect] },
        ],
      ),
    ).toEqual({
      target: { quote: { exact: "first\nsecond" } },
      locator: { kind: "pdf", pageIndex: 2 },
    });
  });
});

describe("EmbedPDF text extraction", () => {
  it("extracts pages in responsive batches", async () => {
    const extractText = vi
      .fn()
      .mockReturnValueOnce({ toPromise: () => Promise.resolve("pages 1-2") })
      .mockReturnValueOnce({ toPromise: () => Promise.resolve("page 3") });
    const engine = { extractText } as unknown as PdfEngine;
    const document = { pageCount: 3 } as PdfDocumentObject;

    await expect(extractPdfDocumentText(engine, document, undefined, 2)).resolves.toBe(
      "pages 1-2\npage 3",
    );
    expect(extractText).toHaveBeenNthCalledWith(1, document, [0, 1]);
    expect(extractText).toHaveBeenNthCalledWith(2, document, [2]);
  });

  it("stops before starting another batch when cancelled", async () => {
    const controller = new AbortController();
    const extractText = vi.fn().mockReturnValue({
      toPromise: () => {
        controller.abort();
        return Promise.resolve("first");
      },
    });
    await expect(
      extractPdfDocumentText(
        { extractText } as unknown as PdfEngine,
        { pageCount: 3 } as PdfDocumentObject,
        controller.signal,
        1,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(extractText).toHaveBeenCalledOnce();
  });
});

const savedHighlight: Annotation = {
  collectionId: collectionId("reading"),
  id: annotationId("ann-1"),
  sourceId: "source-1" as never,
  source: "[[source-1]]",
  annotationType: "highlight",
  color: "yellow",
  target: {
    quote: { exact: "Selected text" },
    pdf: {
      pageIndex: 13,
      coordinateSpace: {
        profile: "embedpdf-selection-page-points-v1",
        box: "crop",
        origin: "top_left",
      },
      quadPoints: [[10, 20, 40, 20, 10, 28, 40, 28]],
    },
  },
  tags: [],
  body: "> Selected text",
  createdAt: dateTime("2026-08-09T00:00:00.000Z"),
};

function decorationCapabilityFixture(): {
  readonly capability: Parameters<typeof createPdfDecorationController>[0];
  readonly importAnnotations: ReturnType<typeof vi.fn>;
  readonly syncAnnotationObject: ReturnType<typeof vi.fn>;
  readonly purgeAnnotation: ReturnType<typeof vi.fn>;
  readonly selectAnnotation: ReturnType<typeof vi.fn>;
  readonly deselectAnnotation: ReturnType<typeof vi.fn>;
  emitLoaded(options?: { readonly processQueue?: boolean }): void;
  annotation(id: string): PdfAnnotationObject | undefined;
} {
  let loaded = false;
  let queue: AnnotationTransferItem[] = [];
  const annotations = new Map<string, PdfAnnotationObject>();
  const listeners = new Set<(event: AnnotationEvent) => void>();
  const track = (annotation: PdfAnnotationObject): void => {
    annotations.set(annotation.id, annotation);
  };
  const importAnnotations = vi.fn((items: AnnotationTransferItem[]) => {
    if (!loaded) {
      queue.push(...items);
      return;
    }
    items.forEach(({ annotation }) => track(annotation));
  });
  const syncAnnotationObject = vi.fn((id: string, patch: Partial<PdfAnnotationObject>) => {
    const current = annotations.get(id);
    if (current) {
      annotations.set(id, { ...current, ...patch } as PdfAnnotationObject);
    }
  });
  const purgeAnnotation = vi.fn((_pageIndex: number, id: string) => annotations.delete(id));
  const selectAnnotation = vi.fn();
  const deselectAnnotation = vi.fn();
  const capability = {
    getAnnotations: () =>
      [...annotations.values()].map((object) => ({ object, commitState: "new" as const })),
    getAnnotationById: (id: string) => {
      const object = annotations.get(id);
      return object ? { object, commitState: "new" as const } : null;
    },
    importAnnotations,
    syncAnnotationObject,
    purgeAnnotation,
    selectAnnotation,
    deselectAnnotation,
    onAnnotationEvent: (listener: (event: AnnotationEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as Parameters<typeof createPdfDecorationController>[0];
  return {
    capability,
    importAnnotations,
    syncAnnotationObject,
    purgeAnnotation,
    selectAnnotation,
    deselectAnnotation,
    emitLoaded(options) {
      annotations.clear();
      loaded = true;
      if (options?.processQueue !== false) {
        queue.forEach(({ annotation }) => track(annotation));
      }
      queue = [];
      listeners.forEach((listener) =>
        listener({ type: "loaded", documentId: "document", total: 0 }),
      );
    },
    annotation: (id) => annotations.get(id),
  };
}

describe("EmbedPDF saved-decoration synchronization", () => {
  it("queues each decoration once and replays active selection after the native load", () => {
    const fixture = decorationCapabilityFixture();
    const controller = createPdfDecorationController(fixture.capability);

    controller.setAnnotations([savedHighlight]);
    controller.setAnnotations([savedHighlight]);
    controller.setActiveAnnotation(savedHighlight);

    // One import each for the highlight and its margin mark, however often annotations are set.
    expect(fixture.importAnnotations).toHaveBeenCalledTimes(2);
    expect(fixture.selectAnnotation).not.toHaveBeenCalled();

    fixture.emitLoaded();

    expect(fixture.annotation("mdbase-reader:ann-1")).toBeDefined();
    expect(fixture.annotation("mdbase-reader:ann-1:margin")).toBeDefined();
    expect(fixture.selectAnnotation).toHaveBeenCalledWith(13, "mdbase-reader:ann-1");
  });

  it("retries a decoration that is absent after the native state replacement", () => {
    const fixture = decorationCapabilityFixture();
    const controller = createPdfDecorationController(fixture.capability);

    controller.setAnnotations([savedHighlight]);
    fixture.emitLoaded({ processQueue: false });

    expect(fixture.importAnnotations).toHaveBeenCalledTimes(4);
    expect(fixture.annotation("mdbase-reader:ann-1")).toBeDefined();
    expect(fixture.annotation("mdbase-reader:ann-1:margin")).toBeDefined();
  });

  it("updates and removes transient decorations without modifying the PDF", () => {
    const fixture = decorationCapabilityFixture();
    const controller = createPdfDecorationController(fixture.capability);
    fixture.emitLoaded();
    controller.setAnnotations([savedHighlight]);

    controller.setAnnotations([{ ...savedHighlight, color: "blue" }]);
    expect(fixture.syncAnnotationObject).toHaveBeenCalledWith(
      "mdbase-reader:ann-1",
      expect.objectContaining({ strokeColor: "#7bb7e8" }),
    );

    controller.setAnnotations([]);
    expect(fixture.purgeAnnotation).toHaveBeenCalledWith(13, "mdbase-reader:ann-1");
    expect(fixture.annotation("mdbase-reader:ann-1")).toBeUndefined();
  });
});
