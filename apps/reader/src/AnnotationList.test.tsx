// @vitest-environment happy-dom
import {
  annotationId,
  collectionId,
  dateTime,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { browseAnnotations } from "./annotation-list-order.js";
import { AnnotationList } from "./AnnotationList.js";

import type * as TanstackVirtual from "@tanstack/react-virtual";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const virtual = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
  startIndex: 0,
  endIndex: 3,
}));
vi.mock("@tanstack/react-virtual", async (original) => {
  const actual = await original<typeof TanstackVirtual>();
  return {
    ...actual,
    useVirtualizer: (options: {
      count: number;
      rangeExtractor: typeof actual.defaultRangeExtractor;
    }) => ({
      getTotalSize: () => options.count * 200,
      getVirtualItems: () =>
        options
          .rangeExtractor({
            startIndex: virtual.startIndex,
            endIndex: virtual.endIndex,
            overscan: 0,
            count: options.count,
          })
          .map((index) => ({ index, start: index * 200 })),
      measureElement: () => undefined,
      scrollToIndex: virtual.scrollToIndex,
    }),
  };
});
vi.mock("./AnnotationCard.js", () => ({
  AnnotationCard: ({ annotation, editing }: { annotation: Annotation; editing: boolean }) => (
    <div data-annotation-id={annotation.id}>
      <button>{editing ? "Editing" : annotation.body}</button>
    </div>
  ),
}));

const annotations = Array.from({ length: 1_000 }, (_, index): Annotation => ({
  id: annotationId(`ann_${String(index)}`),
  sourceId: sourceId("source"),
  source: "[[source]]",
  collectionId: collectionId("reading"),
  annotationType: "note",
  body: `Note ${String(index)}`,
  tags: [],
  createdAt: dateTime("2026-08-09T00:00:00Z"),
}));
const props = {
  annotations: { status: "ready" as const, value: annotations },
  transclusion: {
    busyId: null,
    problemId: null,
    problem: null,
    isEmbedded: () => false,
    insert: vi.fn(),
  },
  onUpdate: vi.fn(),
  onPlanDelete: vi.fn(),
  onDelete: vi.fn(),
  onOpen: vi.fn(),
  editingId: null,
  activeId: null,
  onCancelEdit: vi.fn(),
  readFile: vi.fn(),
};
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
      await Promise.resolve();
    });
  }
  host?.remove();
  root = undefined;
  host = undefined;
  vi.clearAllMocks();
  virtual.startIndex = 0;
  virtual.endIndex = 3;
});
async function render(
  editingId: ReturnType<typeof annotationId> | null = null,
  activeId: ReturnType<typeof annotationId> | null = null,
): Promise<HTMLDivElement> {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(<AnnotationList {...props} editingId={editingId} activeId={activeId} />);
    await Promise.resolve();
  });
  return host;
}

describe("virtual annotation sidebar", () => {
  it("mounts only viewport cards rather than the entire collection", async () => {
    const element = await render();
    expect(element.querySelectorAll("[data-annotation-id]")).toHaveLength(4);
    expect(element.querySelector('[role="listitem"]')?.getAttribute("aria-setsize")).toBe("1000");
  });

  it("preserves keyboard focus when the viewport moves away from the focused card", async () => {
    const element = await render();
    const first = element.querySelector<HTMLElement>("[data-annotation-id]")!;
    const id = first.dataset["annotationId"]!;
    await act(async () => {
      first.querySelector("button")!.focus();
      await Promise.resolve();
    });
    virtual.startIndex = 500;
    virtual.endIndex = 503;
    await render();
    expect(element.querySelectorAll("[data-annotation-id]")).toHaveLength(5);
    expect(element.querySelector(`[data-annotation-id="${id}"]`)).toBe(first);
    expect(document.activeElement).toBe(first.querySelector("button"));
  });

  it("keeps an off-screen editor mounted and reveals newly active annotations", async () => {
    const element = await render(annotationId("ann_900"), annotationId("ann_950"));
    expect(element.querySelectorAll("[data-annotation-id]")).toHaveLength(5);
    expect(element.querySelector('[data-annotation-id="ann_900"]')?.textContent).toBe("Editing");
    const index = browseAnnotations(annotations, "", "all", "document").findIndex(
      ({ id }) => id === "ann_950",
    );
    expect(virtual.scrollToIndex).toHaveBeenCalledWith(index, { align: "auto" });
  });
});
