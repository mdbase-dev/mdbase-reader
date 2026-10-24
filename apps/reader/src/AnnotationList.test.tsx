// @vitest-environment happy-dom
import {
  annotationId,
  collectionId,
  dateTime,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { act, type JSX } from "react";
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
  readingId: ReturnType<typeof annotationId> | null = null,
): Promise<HTMLDivElement> {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(
      <AnnotationList {...props} editingId={editingId} activeId={activeId} readingId={readingId} />,
    );
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

  it("navigates across unmounted cards with End/Home and keeps list positions", async () => {
    const element = await render();
    const first = element.querySelector<HTMLElement>('[role="listitem"]')!;
    await act(async () => {
      first.focus();
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      await Promise.resolve();
    });
    const last = element.querySelector<HTMLElement>('[aria-posinset="1000"]')!;
    expect(document.activeElement).toBe(last);
    expect(last.getAttribute("aria-setsize")).toBe("1000");
    await act(async () => {
      last.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(first);
  });

  it("Tabs to the logical next item, not the next mounted window after pinned focus", async () => {
    const element = await render();
    const first = element.querySelector<HTMLElement>('[role="listitem"]')!;
    await act(async () => {
      first.querySelector("button")!.focus();
      await Promise.resolve();
    });
    virtual.startIndex = 500;
    virtual.endIndex = 503;
    await render();
    await act(async () => {
      first
        .querySelector("button")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      await Promise.resolve();
    });
    expect(document.activeElement?.getAttribute("aria-posinset")).toBe("2");
  });

  it("can materialize all filtered cards for native browser Find and return to windowing", async () => {
    const element = await render();
    const toggle = switchNamed(element, "Include all annotations in page search");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.textContent).toContain("Search above covers all annotations");
    await act(async () => {
      toggle.click();
      await Promise.resolve();
    });
    expect(element.querySelectorAll('[role="listitem"]')).toHaveLength(1000);
    expect(toggle.textContent).toContain("Slower with long lists");
    await act(async () => {
      toggle.click();
      await Promise.resolve();
    });
    expect(element.querySelectorAll('[role="listitem"]')).toHaveLength(4);
    await act(async () => {
      element.querySelector<HTMLInputElement>('input[type="search"]')!.focus();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
      );
      await Promise.resolve();
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});

describe("following the reading position", () => {
  it("highlights reading context but pauses automatic reveals on manual list interaction", async () => {
    const values = browseAnnotations(annotations, "", "all", "document");
    const element = await render(null, null, values[1]!.id);
    expect(element.querySelector('[aria-current="location"]')?.getAttribute("aria-posinset")).toBe(
      "2",
    );
    expect(virtual.scrollToIndex).toHaveBeenCalledWith(1, { align: "auto" });
    await act(async () => {
      element
        .querySelector(".annotation-list")!
        .dispatchEvent(new Event("wheel", { bubbles: true }));
      await Promise.resolve();
    });
    virtual.scrollToIndex.mockClear();
    await render(null, null, values[800]!.id);
    expect(virtual.scrollToIndex).not.toHaveBeenCalledWith(800, { align: "auto" });
    const follow = switchNamed(element, "Follow reading position");
    expect(follow.getAttribute("aria-checked")).toBe("false");
    await act(async () => {
      follow.click();
      await Promise.resolve();
    });
    expect(virtual.scrollToIndex).toHaveBeenCalledWith(800, { align: "auto" });
    expect(follow.getAttribute("aria-checked")).toBe("true");
  });

  it("offers Resume following when paused, without marking the Filter menu", async () => {
    const values = browseAnnotations(annotations, "", "all", "document");
    for (const readingId of [values[1]!.id, null]) {
      const element = await render(null, null, readingId);
      await act(async () => {
        element
          .querySelector(".annotation-list")!
          .dispatchEvent(new Event("wheel", { bubbles: true }));
        await Promise.resolve();
      });
      const trigger = element.querySelector(".annotation-filter-trigger")!;
      expect(trigger.classList.contains("is-changed")).toBe(false);
      const resume = [...element.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Resume following",
      )!;
      expect(resume).toBeDefined();
      virtual.scrollToIndex.mockClear();
      await act(async () => {
        resume.click();
        await Promise.resolve();
      });
      if (readingId) {
        expect(virtual.scrollToIndex).toHaveBeenCalledWith(1, { align: "auto" });
      }
      expect(element.textContent).not.toContain("Resume following");
      expect(switchNamed(element, "Follow reading position").getAttribute("aria-checked")).toBe(
        "true",
      );
    }
  });
});

function switchNamed(element: HTMLElement, name: string): HTMLButtonElement {
  return [...element.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find((item) =>
    item.textContent.startsWith(name),
  )!;
}

describe("annotation Filter menu", () => {
  const kinds: Annotation[] = [
    { ...annotations[0]!, id: annotationId("highlight"), annotationType: "highlight" },
    { ...annotations[1]!, id: annotationId("bookmark"), annotationType: "bookmark" },
    { ...annotations[2]!, id: annotationId("comment"), annotationType: "note" },
  ];
  async function mount(element: JSX.Element): Promise<HTMLDivElement> {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(element);
      await Promise.resolve();
    });
    return host;
  }
  const renderKinds = (): Promise<HTMLDivElement> =>
    mount(
      <AnnotationList
        {...props}
        annotations={{ status: "ready", value: kinds }}
        addMenu={<button type="button">Add</button>}
      />,
    );
  function choice(element: HTMLElement, label: string): HTMLButtonElement {
    return [...element.querySelectorAll<HTMLButtonElement>(".annotation-filter-choice")].find(
      (button) => button.textContent.startsWith(label),
    )!;
  }

  it("puts search, one Filter menu and Add in a single control row", async () => {
    const element = await renderKinds();
    const row = element.querySelector(".annotation-tools")!;
    expect(row.querySelector('input[type="search"]')).not.toBeNull();
    expect(row.querySelector('summary[aria-label="Filter annotations"]')).not.toBeNull();
    expect(row.lastElementChild?.textContent).toBe("Add");
    // Nothing else sits between the control row and the cards.
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
    expect(element.textContent).not.toContain("Pause following");
  });

  it("offers Show and Order as radio groups with arrow keys and one tab stop", async () => {
    const element = await renderKinds();
    const groups = [...element.querySelectorAll('[role="radiogroup"]')];
    expect(groups.map((group) => group.textContent.startsWith("Show"))).toEqual([true, false]);
    const all = choice(element, "All annotations");
    expect(all.getAttribute("role")).toBe("radio");
    expect(
      [...groups[0]!.querySelectorAll('[role="radio"]')].filter((radio) =>
        radio.matches('[tabindex="0"]'),
      ),
    ).toEqual([all]);
    await act(async () => {
      all.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await Promise.resolve();
    });
    expect(all.getAttribute("aria-checked")).toBe("false");
    const next = groups[0]!.querySelector('[aria-checked="true"]');
    expect(next).not.toBeNull();
    expect(document.activeElement).toBe(next);
  });

  it("filters by type with counts, marks the trigger, and clears back to all", async () => {
    const element = await renderKinds();
    expect(choice(element, "All annotations").getAttribute("aria-checked")).toBe("true");
    expect(choice(element, "Bookmarks").textContent).toBe("Bookmarks1");
    await act(async () => {
      choice(element, "Bookmarks").click();
      await Promise.resolve();
    });
    expect(element.querySelectorAll("[data-annotation-id]")).toHaveLength(1);
    expect(element.querySelector('[data-annotation-id="bookmark"]')).not.toBeNull();
    expect(choice(element, "Bookmarks").getAttribute("aria-checked")).toBe("true");
    const trigger = element.querySelector(".annotation-filter-trigger")!;
    expect(trigger.classList.contains("is-changed")).toBe(true);
    expect(trigger.getAttribute("aria-label")).toBe("Filter annotations (changed)");
    expect(element.querySelector('[role="status"]')?.textContent).toContain("1 of 3");
    await act(async () => {
      [...element.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Clear")!
        .click();
      await Promise.resolve();
    });
    expect(element.querySelectorAll("[data-annotation-id]")).toHaveLength(3);
    expect(trigger.classList.contains("is-changed")).toBe(false);
  });

  it("changes order from the same menu and keeps it open while choosing", async () => {
    const element = await renderKinds();
    const details = element.querySelector<HTMLDetailsElement>(".annotation-filter-menu")!;
    details.open = true;
    await act(async () => {
      choice(element, "Newest first").click();
      await Promise.resolve();
    });
    expect(details.open).toBe(true);
    expect(choice(element, "Newest first").getAttribute("aria-checked")).toBe("true");
    expect(choice(element, "Document order").getAttribute("aria-checked")).toBe("false");
    expect(
      element.querySelector(".annotation-filter-trigger")!.classList.contains("is-changed"),
    ).toBe(true);
  });

  it("offers the whole-book switch in the menu even before there are annotations", async () => {
    const onChange = vi.fn();
    const element = await mount(
      <AnnotationList
        {...props}
        annotations={{ status: "ready", value: [] }}
        wholeBook={{ value: false, onChange }}
      />,
    );
    expect(element.textContent).toContain("No annotations yet");
    expect(element.querySelector('input[type="search"]')).toBeNull();
    await act(async () => {
      switchNamed(element, "Show the whole book’s annotations").click();
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
