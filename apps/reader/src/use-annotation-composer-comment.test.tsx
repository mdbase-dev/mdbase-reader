// @vitest-environment happy-dom
import { annotationId, sourceId, type Annotation, type Source } from "@mdbase-reader/core";
import {
  createEventEmitter,
  type AreaSelectionDraft,
  type ReadingSurface,
  type TextSelectionDraft,
} from "@mdbase-reader/reading-surface";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PreviewGateway } from "./preview.js";
import {
  useAnnotationComposer,
  type AnnotationComposerController,
} from "./use-annotation-composer.js";

import type { TextComposerSelection } from "./use-selection-toolbar.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: ReturnType<typeof createRoot> | undefined;
let composer: AnnotationComposerController | undefined;
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  composer = undefined;
  vi.unstubAllGlobals();
});

async function settle(action: () => unknown): Promise<void> {
  await act(async () => {
    await action();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function surfaceFor(
  book: Source,
  documentIndex = 0,
): {
  readonly surface: ReadingSurface;
  readonly text: ReturnType<typeof createEventEmitter<TextSelectionDraft>>;
  readonly areas: ReturnType<typeof createEventEmitter<AreaSelectionDraft>>;
  readonly activations: ReturnType<typeof createEventEmitter<Annotation["id"]>>;
} {
  const text = createEventEmitter<TextSelectionDraft>();
  const areas = createEventEmitter<AreaSelectionDraft>();
  const activations = createEventEmitter<Annotation["id"]>();
  const document = {
    ...book.documents[0]!,
    fileId: `${book.documents[0]!.fileId}-${String(documentIndex)}`,
  };
  const surface = {
    kind: "pdf",
    document: { document, mediaType: "application/pdf", url: "blob:pdf" },
    capabilities: {
      textSelection: { selections: text, cleared: createEventEmitter(), clearSelection: vi.fn() },
      areaSelection: {
        selections: areas,
        beginAreaSelection: vi.fn(),
        cancelAreaSelection: vi.fn(),
      },
      annotationActivation: { activations },
    },
    locations: createEventEmitter(),
    currentLocation: () => ({ kind: "pdf", pageIndex: 0 }),
    goTo: () => Promise.resolve(true),
    destroy: () => Promise.resolve(),
  } as unknown as ReadingSurface;
  return { surface, text, areas, activations };
}

const passage: TextSelectionDraft = {
  locator: { kind: "pdf", pageIndex: 0 },
  target: { position: { kind: "pdf", pageIndex: 0 }, quote: { exact: "A passage" } },
};

function area(): AreaSelectionDraft {
  return {
    pageIndex: 0,
    rect: { x: 0, y: 0, width: 10, height: 10 },
    coordinateProfile: "test",
    image: new Blob(["png"], { type: "image/png" }),
    imageType: "image/png",
    scale: 1,
    withAnnotations: false,
  };
}

async function mount(
  book: Source,
  surface: ReadingSurface,
  create: (request: unknown) => Promise<Annotation>,
  annotations: () => readonly Annotation[],
  options: {
    readonly revealAnnotation?: (annotation: Annotation) => void;
    readonly deleteAnnotation?: () => Promise<void>;
  } = {},
): Promise<() => Promise<void>> {
  function Harness(): null {
    composer = useAnnotationComposer({
      sourceId: book.id,
      source: book,
      surface,
      create,
      annotations: annotations(),
      planDeletion: vi.fn().mockResolvedValue({ brokenLinkPaths: [] }),
      deleteAnnotation: options.deleteAnnotation ?? vi.fn(),
      revealAnnotation: options.revealAnnotation,
    });
    return null;
  }
  root = createRoot(document.createElement("div"));
  await settle(() => root!.render(<Harness />));
  return () => settle(() => root!.render(<Harness />));
}

async function book(): Promise<Source> {
  return (await new PreviewGateway().source(sourceId("src_anthology")))!;
}

it("comments on a selection by saving the highlight and opening its card, with no draft", async () => {
  const source = await book();
  const { surface, text } = surfaceFor(source, 1);
  const created = {
    id: annotationId("ann_commented"),
    collectionId: source.collectionId,
    sourceId: source.id,
    source: "[[source]]",
    annotationType: "highlight",
    target: passage.target,
    tags: [],
    body: "> A passage",
    path: "annotations/commented.md",
    recordRevision: "sha256:1",
  } as unknown as Annotation;
  let saved: readonly Annotation[] = [];
  const create = vi.fn(() => {
    saved = [created];
    return Promise.resolve(created);
  });
  const revealAnnotation = vi.fn();
  const deleteAnnotation = vi.fn(() => Promise.resolve());
  const rerender = await mount(source, surface, create, () => saved, {
    revealAnnotation,
    deleteAnnotation,
  });
  await settle(() => text.emit(passage));
  const target = composer?.toolbar?.target;
  expect(target?.kind).toBe("selection");
  await settle(() =>
    composer!.comment((target as { readonly selection: TextComposerSelection }).selection),
  );
  await rerender();

  expect(create).toHaveBeenCalledOnce();
  expect(create.mock.calls[0]).toEqual([
    expect.objectContaining({ annotationType: "highlight", motivation: "highlighting" }),
  ]);
  // The comment is written on the highlight's card; nothing waits in a composer to resume.
  expect(composer?.editingAnnotationId).toBe(created.id);
  expect(composer?.selection).toBeNull();
  expect(composer?.toolbar).toBeNull();
  expect(composer).not.toHaveProperty("resumeDraft");
  // Its card is listed even when the chapter's list would leave it out.
  expect(revealAnnotation).toHaveBeenCalledExactlyOnceWith(created);
  // Undo would take the comment being written with it, so it is not offered here.
  expect(composer?.savedHighlight).toMatchObject({ status: "saved", undoable: false });
  await settle(() => composer!.undoSavedHighlight());
  expect(deleteAnnotation).not.toHaveBeenCalled();
});

it("says so where it can be seen when commenting could not save the highlight", async () => {
  const source = await book();
  const { surface, text } = surfaceFor(source, 3);
  const create = vi.fn(() => Promise.reject(new Error("The collection is offline.")));
  const revealAnnotation = vi.fn();
  await mount(source, surface, create, () => [], { revealAnnotation });
  await settle(() => text.emit(passage));
  const target = composer?.toolbar?.target as { readonly selection: TextComposerSelection };
  await settle(() => composer!.comment(target.selection));
  expect(composer?.error).toContain("The collection is offline.");
  expect(composer?.editingAnnotationId).toBeNull();
  expect(composer?.selection).toBeNull();
  expect(revealAnnotation).not.toHaveBeenCalled();
});

it("drops a bare area capture when the reader turns to a highlight, but keeps a written one", async () => {
  const source = await book();
  const { surface, areas, activations } = surfaceFor(source, 2);
  const existing = {
    id: annotationId("ann_existing"),
    collectionId: source.collectionId,
    sourceId: source.id,
    source: "[[source]]",
    annotationType: "highlight",
    target: passage.target,
    tags: [],
    body: "",
  } as unknown as Annotation;
  await mount(source, surface, vi.fn(), () => [existing]);

  await settle(() => areas.emit(area()));
  expect(composer?.selection?.kind).toBe("area");
  await settle(() => activations.emit(existing.id));
  expect(composer?.selection).toBeNull();
  expect(composer?.toolbar?.target.kind).toBe("annotation");

  await settle(() => areas.emit(area()));
  await settle(() => composer!.setNote("Worth keeping"));
  await settle(() => activations.emit(existing.id));
  // The written capture stays in its card beside the highlight's toolbar, not behind a button.
  expect(composer?.selection?.kind).toBe("area");
  expect(composer?.note).toBe("Worth keeping");
  expect(composer?.toolbar?.target.kind).toBe("annotation");
});
