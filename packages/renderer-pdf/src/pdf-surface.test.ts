import { annotationId, fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { EmbedPdfSurface } from "./pdf-surface.js";

import type { EmbedPdfRuntime } from "./embedpdf-runtime.js";
import type { AreaSelectionDraft, TextSelectionDraft } from "@mdbase-reader/reading-surface";

function runtimeFixture(): {
  readonly runtime: EmbedPdfRuntime;
  readonly cancelAreaSelection: ReturnType<typeof vi.fn>;
  readonly goToPage: ReturnType<typeof vi.fn>;
  readonly setAnnotations: ReturnType<typeof vi.fn>;
  readonly setActiveAnnotation: ReturnType<typeof vi.fn>;
  readonly extractText: ReturnType<typeof vi.fn>;
  emitArea(selection: AreaSelectionDraft): void;
  emitText(selection: TextSelectionDraft): void;
  emitPage(pageIndex: number): void;
  emitActivation(id: ReturnType<typeof annotationId>): void;
} {
  let areaListener: ((selection: AreaSelectionDraft) => void) | undefined;
  let pageListener: ((pageIndex: number) => void) | undefined;
  let textListener: ((selection: TextSelectionDraft) => void) | undefined;
  let activationListener: ((id: ReturnType<typeof annotationId>) => void) | undefined;
  const goToPage = vi.fn();
  const cancelAreaSelection = vi.fn();
  const setAnnotations = vi.fn();
  const setActiveAnnotation = vi.fn();
  const extractText = vi.fn().mockResolvedValue("Extracted PDF text");
  return {
    runtime: {
      currentPageIndex: () => 2,
      goToPage,
      beginAreaSelection: vi.fn(),
      cancelAreaSelection,
      clearTextSelection: vi.fn(),
      extractText,
      setAnnotations,
      setActiveAnnotation,
      onAreaSelected: (listener) => {
        areaListener = listener;
        return () => {
          areaListener = undefined;
        };
      },
      onPageChanged: (listener) => {
        pageListener = listener;
        return () => {
          pageListener = undefined;
        };
      },
      onTextSelected: (listener) => {
        textListener = listener;
        return () => {
          textListener = undefined;
        };
      },
      onAnnotationActivated: (listener) => {
        activationListener = listener;
        return () => {
          activationListener = undefined;
        };
      },
      destroy: vi.fn(),
    },
    cancelAreaSelection,
    goToPage,
    setAnnotations,
    setActiveAnnotation,
    extractText,
    emitArea: (selection) => areaListener?.(selection),
    emitText: (selection) => textListener?.(selection),
    emitPage: (pageIndex) => pageListener?.(pageIndex),
    emitActivation: (id) => activationListener?.(id),
  };
}

const document = {
  document: {
    fileId: fileId("file-1"),
    file: "[[files/example.pdf]]",
    revision: fileRevision("sha256:a8ca22"),
  },
  mediaType: "application/pdf",
  url: "https://files.example/document.pdf",
} as const;

describe("EmbedPdfSurface", () => {
  it("publishes activated saved annotations", () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);
    const activated = vi.fn();
    surface.capabilities.annotationActivation?.activations.subscribe(activated);

    const id = annotationId("ann-pdf");
    fixture.emitActivation(id);

    expect(activated).toHaveBeenCalledWith(id);
  });

  it("translates zero-based Reader locations to the EmbedPDF runtime", async () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);
    const locations = vi.fn();
    surface.locations.subscribe(locations);

    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 2 });
    await expect(surface.goTo({ kind: "pdf", pageIndex: 7 })).resolves.toBe(true);
    expect(fixture.goToPage).toHaveBeenCalledWith(7);
    fixture.emitPage(8);
    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 8 });
    expect(locations).toHaveBeenCalledWith({ kind: "pdf", pageIndex: 8 });
  });

  it("forwards durable capture data without persisting renderer state", () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);
    const listener = vi.fn();
    surface.capabilities.areaSelection?.selections.subscribe(listener);
    const selection: AreaSelectionDraft = {
      pageIndex: 4,
      rect: { x: 10, y: 20, width: 30, height: 40 },
      coordinateProfile: "embedpdf-capture-page-points-v1",
      image: new Blob(["png"]),
      imageType: "image/png",
      scale: 4,
      withAnnotations: false,
    };

    fixture.emitArea(selection);
    expect(fixture.cancelAreaSelection).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(selection);
  });

  it("publishes text selections with quote and PDF geometry", () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);
    const listener = vi.fn();
    surface.capabilities.textSelection?.selections.subscribe(listener);
    const selection: TextSelectionDraft = {
      target: {
        quote: { exact: "Selected text" },
        pdf: {
          pageIndex: 4,
          coordinateSpace: {
            profile: "embedpdf-selection-page-points-v1",
            box: "crop",
            origin: "top_left",
          },
          quadPoints: [[10, 20, 40, 20, 10, 60, 40, 60]],
        },
      },
      locator: { kind: "pdf", pageIndex: 4 },
    };

    fixture.emitText(selection);
    expect(listener).toHaveBeenCalledWith(selection);
  });

  it("binds decorations by stable file identity rather than byte revision", async () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);
    const matching = {
      collectionId: "reading" as never,
      id: "ann-1" as never,
      sourceId: "source-1" as never,
      source: "[[source-1]]",
      document: document.document,
      annotationType: "highlight",
      tags: [],
      body: "",
      createdAt: "2026-08-09T00:00:00.000Z" as never,
    };
    const previousRevision = {
      ...matching,
      id: "ann-previous-revision" as never,
      document: {
        ...matching.document,
        revision: fileRevision(`sha256:${"b".repeat(64)}`),
      },
    };
    const otherFile = {
      ...matching,
      id: "ann-other-file" as never,
      document: { ...matching.document, fileId: fileId("other") },
    };
    await surface.capabilities.decorations?.setAnnotations([matching, previousRevision, otherFile]);
    expect(fixture.setAnnotations).toHaveBeenCalledWith([matching, previousRevision]);

    await surface.capabilities.decorations?.setActiveAnnotation(previousRevision);
    expect(fixture.setActiveAnnotation).toHaveBeenLastCalledWith(previousRevision);
    await surface.capabilities.decorations?.setActiveAnnotation(otherFile);
    expect(fixture.setActiveAnnotation).toHaveBeenLastCalledWith(null);
  });

  it("exposes bounded renderer text extraction through the surface capability", async () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);
    const controller = new AbortController();

    await expect(
      surface.capabilities.textExtraction?.extractText({ signal: controller.signal }),
    ).resolves.toBe("Extracted PDF text");
    expect(fixture.extractText).toHaveBeenCalledWith({ signal: controller.signal });
  });

  it("rejects incompatible locators and releases runtime subscriptions", async () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);

    await expect(surface.goTo({ kind: "epub", locator: { href: "chapter.xhtml" } })).resolves.toBe(
      false,
    );
    await surface.destroy();
    fixture.emitPage(9);
    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 2 });
  });
});
