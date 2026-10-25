import { annotationId, collectionId, dateTime } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { createEmbedPdfAnnotationActivations } from "./embedpdf-annotation-activation.js";
import { createPdfDecorationController } from "./pdf-decoration-controller.js";

import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationEvent, AnnotationStateChangeEvent } from "@embedpdf/plugin-annotation";
import type { Annotation } from "@mdbase-reader/core";

type Capability = Parameters<typeof createPdfDecorationController>[0];

function highlight(id: string, pageIndex: number): Annotation {
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
        pageIndex,
        coordinateSpace: {
          profile: "embedpdf-selection-page-points-v1",
          box: "crop",
          origin: "top_left",
        },
        quadPoints: [[10, 20, 40, 20, 10, 28, 40, 28]],
      },
    },
    tags: [],
    body: `> Passage ${id}`,
    createdAt: dateTime("2026-08-09T00:00:00.000Z"),
  };
}

/** EmbedPDF's annotation state, with one selection that Reader and the reader's clicks share. */
function embedPdfFixture(): {
  readonly capability: Capability;
  /** The reader clicks a decoration: EmbedPDF dispatches a fresh selection each time. */
  click(decorationId: string): void;
  /** The reader clicks empty page. */
  clickEmptyPage(): void;
  selected(): readonly string[];
} {
  const annotations = new Map<string, PdfAnnotationObject>();
  let selectedUids: string[] = [];
  const stateListeners = new Set<(event: AnnotationStateChangeEvent) => void>();
  const annotationListeners = new Set<(event: AnnotationEvent) => void>();
  const setSelection = (ids: string[]): void => {
    selectedUids = ids;
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
    click: (decorationId) => setSelection([decorationId]),
    clickEmptyPage: () => setSelection([]),
    selected: () => selectedUids,
  };
}

/** The runtime's wiring: activations first, so the decorations hear of a click before Reader. */
function pdfSelection(): ReturnType<typeof embedPdfFixture> & {
  readonly controller: ReturnType<typeof createPdfDecorationController>;
  readonly activated: ReturnType<typeof vi.fn>;
  readonly dismissed: ReturnType<typeof vi.fn>;
} {
  const fixture = embedPdfFixture();
  const activations = createEmbedPdfAnnotationActivations(fixture.capability);
  const controller = createPdfDecorationController(fixture.capability, activations);
  const activated = vi.fn();
  const dismissed = vi.fn();
  activations.subscribe(activated);
  activations.subscribeDismissals(dismissed);
  return { ...fixture, controller, activated, dismissed };
}

const first = highlight("ann-a", 0);
const second = highlight("ann-b", 0);

describe("PDF highlight selection shared by Reader and the reader", () => {
  it("keeps the highlight clicked in the page after Reader showed another", () => {
    const pdf = pdfSelection();
    pdf.controller.setAnnotations([first, second]);
    // A card chosen in the Notes panel: Reader shows its highlight in the page.
    pdf.controller.setActiveAnnotation(first);
    expect(pdf.selected()).toEqual(["mdbase-reader:ann-a"]);
    // Showing it is Reader's doing, not a click to report back.
    expect(pdf.activated).not.toHaveBeenCalled();

    pdf.click("mdbase-reader:ann-b");
    expect(pdf.activated).toHaveBeenCalledExactlyOnceWith("ann-b");

    // Reader then refreshes the page's highlights before it hears of the new choice.
    pdf.controller.setAnnotations([first, second]);
    expect(pdf.selected()).toEqual(["mdbase-reader:ann-b"]);
    pdf.controller.setActiveAnnotation(second);
    expect(pdf.selected()).toEqual(["mdbase-reader:ann-b"]);
    expect(pdf.activated).toHaveBeenCalledOnce();
  });

  it("reports a second click on the highlight already selected", () => {
    const pdf = pdfSelection();
    pdf.controller.setAnnotations([first, second]);
    pdf.controller.setActiveAnnotation(first);

    pdf.click("mdbase-reader:ann-a");
    pdf.click("mdbase-reader:ann-a");

    expect(pdf.activated.mock.calls).toEqual([["ann-a"], ["ann-a"]]);
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
});
