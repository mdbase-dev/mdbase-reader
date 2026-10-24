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

import { commentRequest } from "./annotation-composer-request.js";
import { setAnnotationOwnerPreference } from "./annotation-owner-preference.js";
import { AnnotationSaveCancelled, isAnnotationSaveCancelled } from "./annotation-ownership.js";
import { saveSelection } from "./annotation-selection.js";
import { ConfirmProvider } from "./ConfirmProvider.js";
import { PreviewGateway } from "./preview.js";
import { sourceAnnotationFamily } from "./source-annotation-family.js";
import { partSource } from "./source-parts.fixtures.js";
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
  await settle(() => root!.render(<ConfirmProvider>{element}</ConfirmProvider>));
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

it("saves bookmarks to the default chapter and source comments without a second disclosure", async () => {
  const book = partSource("book");
  const chapter = {
    ...partSource("chapter", "book"),
    documents: book.documents.map((document) => ({
      ...document,
      range: { kind: "pages" as const, start: 0, end: 4 },
    })),
  };
  const sources = [book, chapter];
  const gateway = { source: vi.fn().mockResolvedValue(chapter) } as unknown as PreviewGateway;
  const surface = pdfSurface(book);
  const create = vi.fn((request: AnnotationCreationRequest) =>
    Promise.resolve(request as unknown as Annotation),
  );
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
  await ownedCreate!(bookmark);
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceId: chapter.id, annotationType: "bookmark" }),
  );
  await ownedCreate!(commentRequest(book, "About this book"));
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceId: book.id, annotationType: "note" }),
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(host.querySelector("dialog")).toBeNull();
});

it("keeps the in-app warning for an explicitly chosen owner whose range is unverified", async () => {
  const book = partSource("warning-book");
  const chapter = {
    ...partSource("warning-chapter", "warning-book"),
    documents: book.documents.map((document) => ({
      ...document,
      range: { kind: "pages" as const, start: 5, end: 9 },
    })),
  };
  const surface = pdfSurface(book);
  const create = vi.fn();
  const sources = [book, chapter];
  const gateway = { source: vi.fn().mockResolvedValue(chapter) } as unknown as PreviewGateway;
  let ownership!: ReturnType<typeof useAnnotationOwner>;
  function Harness(): null {
    ownership = useAnnotationOwner({
      source: book,
      surface,
      sources,
      selection: null,
      gateway,
      create,
    });
    return null;
  }
  await mount(<Harness />);
  await settle(() => ownership.control!.choose(chapter.id));
  vi.spyOn(surface.capabilities.annotationRange!, "contains").mockResolvedValue(false);
  let pending!: Promise<unknown>;
  const request = {
    sourceRecord: book,
    collectionId: book.collectionId,
    sourceId: book.id,
    source: "[[sources/warning-book]]",
    document: book.documents[0]!,
    annotationType: "highlight",
    target: passage.target,
    tags: [],
    body: "",
  } as AnnotationCreationRequest;
  await settle(() => {
    pending = ownership.create(request).catch((reason: unknown) => reason);
  });
  expect(host.querySelector("dialog")?.open).toBe(true);
  expect(host.textContent).toContain("verified range");
  expect(create).not.toHaveBeenCalled();
  await settle(() =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent === "Choose another source")!
      .click(),
  );
  expect(isAnnotationSaveCancelled(await pending)).toBe(true);
  expect(create).not.toHaveBeenCalled();
  // A bookmark ignores even a previous explicit owner and never asks for confirmation.
  await ownership.create({ ...request, annotationType: "bookmark" });
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ sourceId: book.id, annotationType: "bookmark" }),
  );
  expect(host.querySelector("dialog")).toBeNull();
});

it("treats a cancelled save as a choice, not a failure", async () => {
  const { book } = await family();
  const surface = pdfSurface(book);
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
