// @vitest-environment happy-dom
import {
  annotationId,
  sourceId,
  type Annotation,
  type AnnotationCreationRequest,
  type Source,
  type SourceSummary,
} from "@mdbase-reader/core";
import {
  createEventEmitter,
  type ReadingSurface,
  type TextSelectionDraft,
} from "@mdbase-reader/reading-surface";
import { act, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { setAnnotationOwnerPreference } from "./annotation-owner-preference.js";
import { AnnotationSaveCancelled, isAnnotationSaveCancelled } from "./annotation-ownership.js";
import { saveSelection } from "./annotation-selection.js";
import { PreviewGateway } from "./preview.js";
import { sourceAnnotationFamily } from "./source-annotation-family.js";
import {
  useAnnotationComposer,
  type AnnotationComposerController,
} from "./use-annotation-composer.js";
import { useAnnotationOwner } from "./use-annotation-owner.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: ReturnType<typeof createRoot> | undefined;
let host = document.createElement("div");
const confirm = vi.fn(() => false);
beforeEach(() => {
  confirm.mockClear();
  vi.stubGlobal("confirm", confirm);
  setAnnotationOwnerPreference("chapter");
});
afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  root = undefined;
  host.remove();
  vi.unstubAllGlobals();
});
async function mount(element: JSX.Element): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await settle(() => root!.render(element));
}
async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

async function family(): Promise<{
  readonly gateway: PreviewGateway;
  readonly book: Source;
  readonly sources: readonly SourceSummary[];
}> {
  const gateway = new PreviewGateway();
  const book = (await gateway.source(sourceId("src_anthology")))!;
  return {
    gateway,
    book,
    sources: sourceAnnotationFamily(book, (await gateway.library()).sources),
  };
}

function pdfSurface(
  book: Source,
  selections = createEventEmitter<TextSelectionDraft>(),
  activations = createEventEmitter<Annotation["id"]>(),
): ReadingSurface {
  return {
    kind: "pdf",
    document: { document: book.documents[0]!, mediaType: "application/pdf", url: "blob:pdf" },
    capabilities: {
      textSelection: { selections, cleared: createEventEmitter(), clearSelection: vi.fn() },
      annotationRange: { contains: vi.fn().mockResolvedValue(true) },
      annotationActivation: { activations },
    },
    locations: createEventEmitter(),
    currentLocation: () => ({ kind: "pdf", pageIndex: 0 }),
    goTo: () => Promise.resolve(true),
    destroy: () => Promise.resolve(),
  };
}

const passage: TextSelectionDraft = {
  locator: { kind: "pdf", pageIndex: 0 },
  target: { position: { kind: "pdf", pageIndex: 0 }, quote: { exact: "Shared pages" } },
};

it("never prompts or saves when a chapter selection's toolbar or a highlight popover is dismissed", async () => {
  const { gateway, book, sources } = await family();
  const selections = createEventEmitter<TextSelectionDraft>();
  const activations = createEventEmitter<Annotation["id"]>();
  const surface = pdfSurface(book, selections, activations);
  const existing = {
    id: annotationId("ann_existing"),
    collectionId: book.collectionId,
    sourceId: book.id,
    source: "[[sources/anthology]]",
    annotationType: "highlight",
    target: passage.target,
    tags: [],
    body: "",
  } as unknown as Annotation;
  const create = vi.fn();
  let composer: AnnotationComposerController | undefined;
  function Harness(): null {
    composer = useAnnotationComposer({
      sourceId: book.id,
      source: book,
      surface,
      create,
      ownershipSources: sources,
      ownerGateway: gateway,
      annotations: [existing],
      planDeletion: vi.fn(),
      deleteAnnotation: vi.fn(),
    });
    return null;
  }
  await mount(<Harness />);
  await settle(() => selections.emit(passage));
  expect(composer?.toolbar?.target.kind).toBe("selection");
  expect(composer?.ownerControl?.choices.length).toBeGreaterThan(1);
  await settle(() => composer!.dismissToolbar());
  expect(composer?.toolbar).toBeNull();

  await settle(() => activations.emit(existing.id));
  expect(composer?.toolbar?.target.kind).toBe("annotation");
  await settle(() => composer!.dismissToolbar());
  expect(composer?.toolbar).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

it("saves a selection highlight without an owner prompt even after its selection has gone", async () => {
  const { gateway, book, sources } = await family();
  const surface = pdfSurface(book);
  const create = vi.fn((request: AnnotationCreationRequest) =>
    Promise.resolve(request as unknown as Annotation),
  );
  let ownedCreate: ((request: AnnotationCreationRequest) => Promise<Annotation>) | undefined;
  function Harness(): null {
    // The toolbar has already gone, so the hook no longer sees a live selection.
    ownedCreate = useAnnotationOwner({
      source: book,
      surface,
      sources,
      selection: null,
      gateway,
      create,
    }).create;
    return null;
  }
  await mount(<Harness />);
  const problem = vi.fn();
  await saveSelection(
    { source: book, surface, create: ownedCreate! },
    { kind: "text", value: passage },
    "",
    vi.fn(),
    problem,
    vi.fn(),
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(problem).not.toHaveBeenCalled();
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ annotationType: "highlight" }));
});

it("treats declining a source-level owner confirmation as a choice, not a failure", async () => {
  const { gateway, book, sources } = await family();
  const surface = pdfSurface(book);
  const create = vi.fn();
  let ownedCreate: ((request: AnnotationCreationRequest) => Promise<Annotation>) | undefined;
  function Harness(): null {
    ownedCreate = useAnnotationOwner({
      source: book,
      surface,
      sources,
      selection: null,
      gateway,
      create,
    }).create;
    return null;
  }
  await mount(<Harness />);
  const bookmark = {
    sourceRecord: book,
    collectionId: book.collectionId,
    sourceId: book.id,
    source: "[[sources/anthology]]",
    document: { fileId: book.documents[0]!.fileId, revision: book.documents[0]!.revision },
    annotationType: "bookmark",
    motivation: "bookmarking",
    target: { position: { kind: "pdf", pageIndex: 0 } },
    tags: [],
    body: "",
  } as unknown as AnnotationCreationRequest;
  const reason = await ownedCreate!(bookmark).catch((error: unknown) => error);
  expect(confirm).toHaveBeenCalledOnce();
  expect(isAnnotationSaveCancelled(reason)).toBe(true);
  expect(create).not.toHaveBeenCalled();

  const problem = vi.fn();
  const failing = vi.fn(() => Promise.reject(new AnnotationSaveCancelled()));
  await saveSelection(
    { source: book, surface, create: failing },
    { kind: "text", value: passage },
    "",
    vi.fn(),
    problem,
    vi.fn(),
  );
  expect(problem).not.toHaveBeenCalled();
});
