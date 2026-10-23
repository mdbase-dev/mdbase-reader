// @vitest-environment happy-dom
import { fileId, fileRevision, sourceId, annotationId } from "@mdbase-reader/core";
import {
  createEventEmitter,
  type ReadingSurface,
  type SurfaceKind,
} from "@mdbase-reader/reading-surface";
import { act, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { AnnotationList } from "./AnnotationList.js";
import { AnnotationOwnerChooser } from "./AnnotationOwnerChooser.js";
import { PreviewGateway } from "./preview.js";
import { sourceAnnotationFamily } from "./source-annotation-family.js";
import { useDocumentDecorations } from "./use-document-decorations.js";
import { useSourceAnnotationView } from "./use-source-annotation-view.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: ReturnType<typeof createRoot> | undefined;
let host = document.createElement("div");
afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  root = undefined;
  host.remove();
});
async function mount(element: JSX.Element): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(element);
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
const bookId = sourceId("src_anthology");
const chapterId = sourceId("src_anthology_chapter_1");
it("batch-loads the family, labels owners and filters chapters without new queries", async () => {
  const gateway = new PreviewGateway();
  const book = (await gateway.source(bookId))!;
  const owned = { status: "ready" as const, value: await gateway.annotations(bookId) };
  const batch = vi.spyOn(gateway, "annotationsForSources");
  function Harness(): JSX.Element {
    const { annotations, view } = useSourceAnnotationView(gateway, book, owned);
    return (
      <AnnotationList
        annotations={annotations}
        owners={view.sources}
        transclusion={{
          busyId: null,
          problemId: null,
          problem: null,
          isEmbedded: () => false,
          insert: vi.fn(),
        }}
        onUpdate={vi.fn()}
        onPlanDelete={vi.fn()}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        editingId={null}
        activeId={null}
        onCancelEdit={vi.fn()}
        readFile={vi.fn()}
      />
    );
  }
  await mount(<Harness />);
  // Native-Find mode deliberately renders every filtered card in happy-dom as in the product.
  act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(batch).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("Owner: Chapter 1");
  expect(host.textContent).toContain("Owner: Chapter 2");
  const filter = host.querySelector<HTMLSelectElement>(
    '[aria-label="Filter annotations by chapter"]',
  )!;
  act(() => {
    filter.value = chapterId;
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.querySelectorAll("[data-annotation-id]")).toHaveLength(1);
  expect(host.textContent).toContain("Owner: Chapter 1");
  expect(host.textContent).not.toContain("Owner: Chapter 2");
  expect(batch).toHaveBeenCalledTimes(1);
});
it("shows only a chapter’s owned annotations until whole-book visibility is requested", async () => {
  const gateway = new PreviewGateway();
  const chapter = (await gateway.source(chapterId))!;
  const owned = { status: "ready" as const, value: await gateway.annotations(chapterId) };
  function Harness(): JSX.Element {
    const { annotations, view } = useSourceAnnotationView(gateway, chapter, owned);
    return (
      <>
        <button onClick={() => view.setWholeBook(!view.wholeBook)}>Whole book</button>
        <output>{annotations.status === "ready" ? annotations.value.length : "loading"}</output>
      </>
    );
  }
  await mount(<Harness />);
  expect(host.querySelector("output")!.textContent).toBe("1");
  act(() => host.querySelector("button")!.click());
  expect(host.querySelector("output")!.textContent).toBe("3");
});
it("preserves annotation owners, targets and records through detach and source deletion", async () => {
  const gateway = new PreviewGateway();
  const chapter = (await gateway.source(chapterId))!;
  const before = await gateway.annotations(chapterId);
  const detached = await gateway.setSourcePartOf(chapter, null);
  expect(detached.documents).toEqual(chapter.documents);
  expect(await gateway.annotations(chapterId)).toEqual(before);
  expect(
    sourceAnnotationFamily((await gateway.source(bookId))!, (await gateway.library()).sources).map(
      ({ id }) => id,
    ),
  ).not.toContain(chapterId);
  const plan = await gateway.planSourceRemoval(chapterId);
  expect(plan.brokenLinkPaths).toContain(before[0]!.path);
  await gateway.removeSource(plan);
  expect(await gateway.source(chapterId)).toBeNull();
  expect(await gateway.annotations(chapterId)).toEqual(before);
});
it("guards preview moves and keeps note bodies, selectors and document targets unchanged", async () => {
  const gateway = new PreviewGateway();
  const annotation = (await gateway.annotations(chapterId))[0]!;
  const book = (await gateway.source(bookId))!;
  const moved = await gateway.moveAnnotationOwner(annotation, book);
  expect(moved).toMatchObject({
    id: annotation.id,
    sourceId: bookId,
    document: annotation.document,
    target: annotation.target,
    body: annotation.body,
  });
  expect((await gateway.source(bookId))!.body).toBe(book.body);
  await expect(gateway.moveAnnotationOwner(annotation, book)).rejects.toThrow("changed elsewhere");
});
it("gives the owner chooser a native accessible name and keyboard-compatible change event", async () => {
  const gateway = new PreviewGateway();
  const sources = (await gateway.library()).sources.filter(
    (item) => item.id === bookId || item.id === chapterId,
  );
  const choose = vi.fn();
  await mount(
    <AnnotationOwnerChooser
      control={{
        ownerId: chapterId,
        sources,
        pending: false,
        reason: "Created in this chapter.",
        choose,
      }}
    />,
  );
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Annotation owner"]')!;
  expect(select.value).toBe(chapterId);
  act(() => {
    select.value = bookId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(choose).toHaveBeenCalledWith(bookId);
  expect(host.querySelector('[role="status"]')!.textContent).toContain("chapter");
});

it.each<SurfaceKind>(["pdf", "epub", "html"])(
  "projects aggregate annotations only onto the exact file/revision (%s)",
  async (kind) => {
    const gateway = new PreviewGateway();
    const book = (await gateway.source(bookId))!;
    const chapter = (await gateway.annotations(chapterId))[0]!;
    const own = (await gateway.annotations(bookId))[0]!;
    const wrongRevision = {
      ...chapter,
      id: annotationId("wrong-revision"),
      document: { ...chapter.document!, revision: fileRevision(`sha256:${"f".repeat(64)}`) },
    };
    const otherFile = {
      ...chapter,
      id: annotationId("other-file"),
      document: { ...chapter.document!, fileId: fileId("separate-chapter-pdf") },
    };
    const setAnnotations = vi.fn().mockResolvedValue(undefined);
    const surface: ReadingSurface = {
      kind,
      document: { document: book.documents[0]!, mediaType: "application/pdf", url: "blob:fixture" },
      capabilities: {
        decorations: { setAnnotations, setActiveAnnotation: vi.fn().mockResolvedValue(undefined) },
      },
      locations: createEventEmitter(),
      currentLocation: () => null,
      goTo: vi.fn(),
      destroy: vi.fn(),
    };
    const resource = { status: "ready" as const, value: [own, chapter, wrongRevision, otherFile] };
    function Harness(): JSX.Element {
      useDocumentDecorations(surface, resource);
      return <></>;
    }
    await mount(<Harness />);
    expect(setAnnotations).toHaveBeenCalledExactlyOnceWith([own, chapter]);
  },
);
