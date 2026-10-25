// @vitest-environment happy-dom
import { annotationId, sourceId, type Annotation } from "@mdbase-reader/core";
import {
  createEventEmitter,
  type ReadingSurface,
  type TextSelectionDraft,
} from "@mdbase-reader/reading-surface";
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

it("keeps one selected highlight whether the pane or the document chose it", async () => {
  const gateway = new PreviewGateway();
  const book = (await gateway.source(sourceId("src_anthology")))!;
  const document = book.documents[0]!;
  const activations = createEventEmitter<Annotation["id"]>();
  const dismissals = createEventEmitter<null>();
  const shown: (Annotation["id"] | null)[] = [];
  const surface = {
    kind: "pdf",
    document: { document, mediaType: "application/pdf", url: "blob:pdf" },
    capabilities: {
      textSelection: {
        selections: createEventEmitter<TextSelectionDraft>(),
        cleared: createEventEmitter(),
        clearSelection: vi.fn(),
      },
      decorations: {
        setAnnotations: () => Promise.resolve(),
        setActiveAnnotation: (annotation: Annotation | null) => {
          shown.push(annotation?.id ?? null);
          return Promise.resolve();
        },
      },
      annotationActivation: { activations, dismissals },
    },
    locations: createEventEmitter(),
    currentLocation: () => ({ kind: "pdf", pageIndex: 0 }),
    goTo: () => Promise.resolve(true),
    destroy: () => Promise.resolve(),
  } as unknown as ReadingSurface;
  const highlight = (id: string): Annotation =>
    ({
      id: annotationId(id),
      collectionId: book.collectionId,
      sourceId: book.id,
      source: "[[sources/anthology]]",
      document,
      annotationType: "highlight",
      target: { quote: { exact: id }, pdf: { pageIndex: 0 } },
      tags: [],
      body: "",
    }) as unknown as Annotation;
  const first = highlight("ann_first");
  const second = highlight("ann_second");
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
  const showing = (): Annotation["id"] | null | undefined => shown.at(-1);

  // The report: a card chosen in the pane, then another highlight clicked in the document.
  await settle(() => composer!.open(first));
  expect(composer?.activeAnnotationId).toBe(first.id);
  expect(showing()).toBe(first.id);
  await settle(() => activations.emit(second.id));
  expect(composer?.activeAnnotationId).toBe(second.id);
  expect(composer?.toolbar?.target).toMatchObject({ kind: "annotation", annotation: second });
  expect(showing()).toBe(second.id);

  // Clicking it again brings its actions back once they were closed.
  await settle(() => composer!.dismissToolbar());
  await settle(() => activations.emit(second.id));
  expect(composer?.toolbar?.target).toMatchObject({ kind: "annotation", annotation: second });
  expect(composer?.activeAnnotationId).toBe(second.id);

  // Escape lets it go in the pane and the document alike.
  await settle(() => composer!.releaseAnnotation(second.id));
  expect(composer?.activeAnnotationId).toBeNull();
  expect(composer?.toolbar).toBeNull();
  expect(showing()).toBeNull();

  // So does a click on empty page, which the document reports.
  await settle(() => composer!.open(first));
  expect(showing()).toBe(first.id);
  await settle(() => dismissals.emit(null));
  expect(composer?.activeAnnotationId).toBeNull();
  expect(showing()).toBeNull();
});
