import { annotationId, collectionId, dateTime } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { createEmbedPdfAnnotationActivations } from "./embedpdf-annotation-activation.js";
import { createPdfDecorationController } from "./pdf-decoration-controller.js";
import { annotationToPdfDecoration } from "./pdf-decoration.js";

import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationEvent, AnnotationStateChangeEvent } from "@embedpdf/plugin-annotation";
import type { Annotation } from "@mdbase-reader/core";

type Capability = Parameters<typeof createPdfDecorationController>[0];

/** A highlight on one line of page 0, `top` points down the page. */
function highlight(id: string, top: number): Annotation {
  return {
    collectionId: collectionId("reading"),
    id: annotationId(id),
    sourceId: "source-1" as never,
    source: "[[source-1]]",
    annotationType: "highlight",
    color: "yellow",
    target: {
      quote: { exact: `Passage ${id}` },
      pdf: {
        pageIndex: 0,
        coordinateSpace: {
          profile: "embedpdf-selection-page-points-v1",
          box: "crop",
          origin: "top_left",
        },
        quadPoints: [[10, top, 200, top, 10, top + 10, 200, top + 10]],
      },
    },
    tags: [],
    body: `> Passage ${id}`,
    createdAt: dateTime("2026-08-09T00:00:00.000Z"),
  };
}

/**
 * EmbedPDF's annotation state, with one selection that Reader and the reader's clicks share. Like
 * EmbedPDF, it reports a state only when it differs from the last one reported: selecting the
 * annotation already selected reports nothing.
 */
function embedPdfFixture(): {
  readonly capability: Capability;
  select(ids: string[]): void;
  selected(): readonly string[];
  importStray(annotation: Annotation): void;
} {
  const annotations = new Map<string, PdfAnnotationObject>();
  let selectedUids: string[] = [];
  let reported = "[]";
  const stateListeners = new Set<(event: AnnotationStateChangeEvent) => void>();
  const annotationListeners = new Set<(event: AnnotationEvent) => void>();
  const setSelection = (ids: string[]): void => {
    selectedUids = ids;
    if (JSON.stringify(ids) === reported) {
      return;
    }
    reported = JSON.stringify(ids);
    const event = { documentId: "document", state: { selectedUids } };
    stateListeners.forEach((listener) => listener(event as unknown as AnnotationStateChangeEvent));
  };
  const capability = {
    getAnnotations: () =>
      [...annotations.values()].map((object) => ({ object, commitState: "new" as const })),
    getAnnotationById: (id: string) => {
      const object = annotations.get(id);
      return object ? { object, commitState: "new" as const } : null;
    },
    getSelectedAnnotations: () =>
      selectedUids.flatMap((id) => {
        const object = annotations.get(id);
        return object ? [{ object, commitState: "new" as const }] : [];
      }),
    importAnnotations: (items: { annotation: PdfAnnotationObject }[]) =>
      items.forEach(({ annotation }) => annotations.set(annotation.id, annotation)),
    syncAnnotationObject: vi.fn(),
    purgeAnnotation: (_pageIndex: number, id: string) => annotations.delete(id),
    selectAnnotation: (_pageIndex: number, id: string) => setSelection([id]),
    deselectAnnotation: () => setSelection([]),
    onStateChange: (listener: (event: AnnotationStateChangeEvent) => void) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onAnnotationEvent: (listener: (event: AnnotationEvent) => void) => {
      annotationListeners.add(listener);
      return () => annotationListeners.delete(listener);
    },
  } as unknown as Capability;
  return {
    capability,
    select: setSelection,
    selected: () => selectedUids,
    importStray: (annotation) => {
      const decoration = annotationToPdfDecoration(annotation);
      if (decoration) {
        annotations.set(decoration.id, decoration);
      }
    },
  };
}

/** The runtime's wiring, with the page drawn one screen pixel to a point from the corner. */
function pdfSelection(): {
  readonly controller: ReturnType<typeof createPdfDecorationController>;
  readonly activated: ReturnType<typeof vi.fn>;
  readonly dismissed: ReturnType<typeof vi.fn>;
  /** The reader clicks a highlight: EmbedPDF selects it, then the click itself is judged. */
  click(annotation: Annotation): void;
  clickEmptyPage(): void;
  selected(): readonly string[];
  importStray(annotation: Annotation): void;
} {
  const fixture = embedPdfFixture();
  const activations = createEmbedPdfAnnotationActivations(fixture.capability, (rects) => {
    const rect = rects[0]?.rect;
    return rect
      ? { x: rect.origin.x, y: rect.origin.y, width: rect.size.width, height: rect.size.height }
      : null;
  });
  // Activations first, so the decorations hear of a click before Reader does.
  const controller = createPdfDecorationController(fixture.capability, activations);
  const activated = vi.fn();
  const dismissed = vi.fn();
  activations.subscribe(activated);
  activations.subscribeDismissals(dismissed);
  const press = (ids: string[], point: { x: number; y: number }): void => {
    activations.pointerDown();
    fixture.select(ids);
    activations.pointerClicked(point);
  };
  return {
    controller,
    activated,
    dismissed,
    click: (annotation) => {
      const top = annotation.target?.pdf?.quadPoints[0]?.[1] ?? 0;
      press([`mdbase-reader:${annotation.id}`], { x: 100, y: top + 5 });
    },
    clickEmptyPage: () => press([], { x: 100, y: 700 }),
    selected: fixture.selected,
    importStray: fixture.importStray,
  };
}

const first = highlight("ann-a", 20);
const second = highlight("ann-b", 60);

describe("PDF highlight selection shared by Reader and the reader", () => {
  it("keeps the highlight clicked in the page after Reader showed another", () => {
    const pdf = pdfSelection();
    pdf.controller.setAnnotations([first, second]);
    // A card chosen in the Notes panel: Reader shows its highlight in the page.
    pdf.controller.setActiveAnnotation(first);
    expect(pdf.selected()).toEqual(["mdbase-reader:ann-a"]);
    // Showing it is Reader's doing, not a click to report back.
    expect(pdf.activated).not.toHaveBeenCalled();

    pdf.click(second);
    expect(pdf.activated).toHaveBeenCalledExactlyOnceWith("ann-b");

    // Reader then refreshes the page's highlights before it hears of the new choice.
    pdf.controller.setAnnotations([first, second]);
    expect(pdf.selected()).toEqual(["mdbase-reader:ann-b"]);
    pdf.controller.setActiveAnnotation(second);
    expect(pdf.selected()).toEqual(["mdbase-reader:ann-b"]);
    expect(pdf.activated).toHaveBeenCalledOnce();
  });

  it("reports a click on the highlight Reader showed for a card", () => {
    const pdf = pdfSelection();
    pdf.controller.setAnnotations([first, second]);
    pdf.controller.setActiveAnnotation(first);

    pdf.click(first);

    expect(pdf.activated).toHaveBeenCalledExactlyOnceWith("ann-a");
  });

  it("reports every click on the highlight already selected, once each", () => {
    const pdf = pdfSelection();
    pdf.controller.setAnnotations([first, second]);

    pdf.click(second);
    pdf.click(second);
    pdf.click(second);

    expect(pdf.activated.mock.calls).toEqual([["ann-b"], ["ann-b"], ["ann-b"]]);
  });

  it("lets the highlight go on a click on empty page, and keeps it gone", () => {
    const pdf = pdfSelection();
    pdf.controller.setAnnotations([first, second]);
    pdf.controller.setActiveAnnotation(first);

    pdf.clickEmptyPage();
    expect(pdf.dismissed).toHaveBeenCalledOnce();
    pdf.controller.setAnnotations([first, second]);
    expect(pdf.selected()).toEqual([]);

    // Reader letting it go itself is no dismissal by the reader.
    pdf.controller.setActiveAnnotation(second);
    pdf.controller.setActiveAnnotation(null);
    expect(pdf.selected()).toEqual([]);
    expect(pdf.dismissed).toHaveBeenCalledOnce();
    expect(pdf.activated).not.toHaveBeenCalled();
  });

  it("puts back Reader's choice after a click on a highlight Reader does not list", async () => {
    const pdf = pdfSelection();
    pdf.controller.setAnnotations([first, second]);
    pdf.controller.setActiveAnnotation(first);
    // A decoration still in the page, for a highlight Reader has stopped listing.
    const stale = highlight("ann-stale", 100);
    pdf.importStray(stale);

    pdf.click(stale);
    pdf.controller.setAnnotations([first, second]);
    await Promise.resolve();

    expect(pdf.selected()).toEqual(["mdbase-reader:ann-a"]);
  });
});
