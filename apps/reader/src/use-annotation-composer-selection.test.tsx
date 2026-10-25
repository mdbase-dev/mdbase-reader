// @vitest-environment happy-dom
import { annotationId, sourceId, type Annotation } from "@mdbase-reader/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { PreviewGateway } from "./preview.js";
import {
  useAnnotationComposer,
  type AnnotationComposerController,
} from "./use-annotation-composer.js";
import { useDocumentDecorations } from "./use-document-decorations.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

async function settle(action: () => unknown): Promise<void> {
  await act(async () => {
    await action();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

interface Decoration {
  readonly id: string;
  readonly pageIndex: number;
}

/**
 * EmbedPDF's annotation state as the PDF renderer drives it: one selection, shared by Reader
 * showing its active highlight and by the reader's clicks, reported only when it changes.
 */
function embedPdfAnnotations(): {
  readonly capability: object;
  click(decorationId: string): void;
  clickEmptyPage(): void;
  selected(): readonly string[];
} {
  const decorations = new Map<string, Decoration>();
  const listeners = new Set<(event: { state: { selectedUids: string[] } }) => void>();
  let selectedUids: string[] = [];
  let reported = "[]";
  const select = (ids: string[]): void => {
    selectedUids = ids;
    if (JSON.stringify(ids) !== reported) {
      reported = JSON.stringify(ids);
      listeners.forEach((listener) => listener({ state: { selectedUids } }));
    }
  };
  const tracked = (id: string): { object: Decoration } | null => {
    const object = decorations.get(id);
    return object ? { object } : null;
  };
  return {
    capability: {
      getAnnotations: () => [...decorations.values()].map((object) => ({ object })),
      getAnnotationById: tracked,
      getSelectedAnnotations: () => selectedUids.flatMap((id) => tracked(id) ?? []),
      importAnnotations: (items: { annotation: Decoration }[]) =>
        items.forEach(({ annotation }) => decorations.set(annotation.id, annotation)),
      syncAnnotationObject: vi.fn(),
      purgeAnnotation: (_pageIndex: number, id: string) => decorations.delete(id),
      selectAnnotation: (_pageIndex: number, id: string) => select([id]),
      deselectAnnotation: () => select([]),
      onStateChange: (listener: (event: { state: { selectedUids: string[] } }) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onAnnotationEvent: () => () => undefined,
    },
    click: (decorationId) => select([decorationId]),
    clickEmptyPage: () => select([]),
    selected: () => selectedUids,
  };
}

/** Any other EmbedPDF capability: every method answers, and every subscription is inert. */
const inert: object = new Proxy(() => inert, {
  get: (_target, key) => (key === "then" || typeof key === "symbol" ? undefined : inert),
  apply: () => inert,
});
const capabilities: Record<string, object> = {
  scroll: new Proxy(
    { getCurrentPage: () => 1 },
    { get: (target, key) => (Reflect.get(target, key) as unknown) ?? inert },
  ),
};

it("keeps one selected highlight whether the pane or the PDF chose it", async () => {
  const gateway = new PreviewGateway();
  const book = (await gateway.source(sourceId("src_anthology")))!;
  const document = book.documents[0]!;
  // The real PDF renderer, as ConnectedDocument loads it, over a fake EmbedPDF.
  const { createEmbedPdfRuntime, EmbedPdfSurface } = await import("@mdbase-reader/renderer-pdf");
  const embedPdf = embedPdfAnnotations();
  const registry = {
    getPlugin: (id: string) => ({
      provides: () => (id === "annotation" ? embedPdf.capability : (capabilities[id] ?? inert)),
    }),
    getEngine: () => inert,
  };
  const surface = new EmbedPdfSurface(
    { document, mediaType: "application/pdf", url: "blob:pdf" },
    createEmbedPdfRuntime(registry as never),
  );
  const highlight = (id: string, top: number): Annotation =>
    ({
      id: annotationId(id),
      collectionId: book.collectionId,
      sourceId: book.id,
      source: "[[sources/anthology]]",
      document,
      annotationType: "highlight",
      target: {
        quote: { exact: id },
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
      body: "",
      createdAt: "2026-08-09T00:00:00.000Z",
    }) as unknown as Annotation;
  const first = highlight("ann_first", 20);
  const second = highlight("ann_second", 60);
  const annotations = { status: "ready", value: [first, second] } as const;
  let composer: AnnotationComposerController | undefined;
  function Harness(): null {
    composer = useAnnotationComposer({
      sourceId: book.id,
      source: book,
      surface,
      create: vi.fn(),
      annotations: annotations.value,
      planDeletion: vi.fn().mockResolvedValue({ brokenLinkPaths: [] }),
      deleteAnnotation: vi.fn(),
    });
    useDocumentDecorations(surface, annotations, composer.activeAnnotationId);
    return null;
  }
  root = createRoot(globalThis.document.createElement("div"));
  await settle(() => root!.render(<Harness />));

  // The report: a card chosen in the pane, then another highlight clicked in the PDF.
  await settle(() => composer!.open(first));
  expect(composer?.activeAnnotationId).toBe(first.id);
  expect(embedPdf.selected()).toEqual(["mdbase-reader:ann_first"]);
  // Showing the card's highlight is no click of the reader's.
  expect(composer?.toolbar).toBeNull();
  await settle(() => embedPdf.click("mdbase-reader:ann_second"));
  expect(composer?.activeAnnotationId).toBe(second.id);
  expect(composer?.toolbar?.target).toMatchObject({ kind: "annotation", annotation: second });
  expect(embedPdf.selected()).toEqual(["mdbase-reader:ann_second"]);

  // Escape lets it go in the pane and the PDF alike.
  await settle(() => composer!.releaseAnnotation(second.id));
  expect(composer?.activeAnnotationId).toBeNull();
  expect(composer?.toolbar).toBeNull();
  expect(embedPdf.selected()).toEqual([]);

  // So does a click on empty page, with nothing else open to take it.
  await settle(() => composer!.open(first));
  await settle(() => embedPdf.clickEmptyPage());
  expect(composer?.activeAnnotationId).toBeNull();
  expect(embedPdf.selected()).toEqual([]);

  // A highlight whose comment is being written stays selected, in the PDF too.
  await settle(() => composer!.edit(second));
  await settle(() => embedPdf.clickEmptyPage());
  expect(composer?.activeAnnotationId).toBe(second.id);
  expect(composer?.editingAnnotationId).toBe(second.id);
  expect(embedPdf.selected()).toEqual(["mdbase-reader:ann_second"]);
  await settle(() => composer!.stopEditing());

  // Escape with no toolbar open lets a card's highlight go too.
  await settle(() => composer!.open(first));
  await settle(() =>
    globalThis.document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
  );
  expect(composer?.activeAnnotationId).toBeNull();
  expect(embedPdf.selected()).toEqual([]);
});
