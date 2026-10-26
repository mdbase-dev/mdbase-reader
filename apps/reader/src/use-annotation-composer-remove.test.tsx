// @vitest-environment happy-dom
import { annotationId, sourceId, type Annotation } from "@mdbase-reader/core";
import {
  createEventEmitter,
  type ReadingSurface,
  type TextSelectionDraft,
} from "@mdbase-reader/reading-surface";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { PreviewGateway } from "./preview.js";
import { createRoot } from "./testing/i18n.js";
import {
  useAnnotationComposer,
  type AnnotationComposerController,
} from "./use-annotation-composer.js";

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

it("leaves another highlight's toolbar and selection alone when a deletion finishes", async () => {
  const gateway = new PreviewGateway();
  const book = (await gateway.source(sourceId("src_anthology")))!;
  const activations = createEventEmitter<Annotation["id"]>();
  const surface = {
    kind: "pdf",
    document: { document: book.documents[0]!, mediaType: "application/pdf", url: "blob:pdf" },
    capabilities: {
      textSelection: {
        selections: createEventEmitter<TextSelectionDraft>(),
        cleared: createEventEmitter(),
        clearSelection: vi.fn(),
      },
      annotationActivation: { activations },
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
      annotationType: "highlight",
      target: { quote: { exact: id } },
      tags: [],
      body: "",
    }) as unknown as Annotation;
  const undone = highlight("ann_undone");
  const other = highlight("ann_other");
  // The deletion finishes only after the reader has clicked another highlight.
  let finishDeletion = (): void => undefined;
  const deleteAnnotation = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishDeletion = resolve;
      }),
  );
  let composer: AnnotationComposerController | undefined;
  function Harness(): null {
    composer = useAnnotationComposer({
      sourceId: book.id,
      source: book,
      surface,
      create: vi.fn(),
      annotations: [undone, other],
      planDeletion: vi.fn().mockResolvedValue({ brokenLinkPaths: [] }),
      deleteAnnotation,
    });
    return null;
  }
  const host = document.createElement("div");
  root = createRoot(host);
  await settle(() => root!.render(<Harness />));

  let removal: Promise<readonly string[]> | undefined;
  await settle(() => {
    removal = composer!.remove(undone);
  });
  await settle(() => activations.emit(other.id));
  await settle(async () => {
    finishDeletion();
    await removal;
  });

  expect(deleteAnnotation).toHaveBeenCalledOnce();
  expect(composer?.toolbar?.target).toMatchObject({ kind: "annotation", annotation: other });
  expect(composer?.activeAnnotationId).toBe(other.id);

  // Deleting the highlight the toolbar shows still closes it.
  await settle(() => {
    removal = composer!.remove(other);
  });
  await settle(async () => {
    finishDeletion();
    await removal;
  });
  expect(composer?.toolbar).toBeNull();
  expect(composer?.activeAnnotationId).toBeNull();
});
