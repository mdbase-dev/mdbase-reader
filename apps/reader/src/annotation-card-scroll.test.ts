import { describe, expect, it, vi } from "vitest";

import { scrollAnnotationCard } from "./annotation-card-scroll.js";

function fixture({
  top = 450,
  bottom = 550,
  hidden = false,
  visibility = "visible",
  rendered = true,
  reducedMotion = false,
  hasList = true,
} = {}): {
  card: HTMLElement;
  list: { scrollTo: ReturnType<typeof vi.fn> };
  scrollIntoView: ReturnType<typeof vi.fn>;
} {
  const list = {
    getBoundingClientRect: () => ({ top: 100 }),
    clientTop: 2,
    clientHeight: 300,
    scrollTop: 80,
    scrollTo: vi.fn(),
  };
  const card = {
    closest: (selector: string) =>
      selector === ".annotation-list" ? (hasList ? list : null) : hidden ? {} : null,
    getClientRects: () => (rendered ? [{}] : []),
    getBoundingClientRect: () => ({ top, bottom }),
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({ visibility }),
        matchMedia: () => ({ matches: reducedMotion }),
      },
    },
    scrollIntoView: vi.fn(),
  };
  return { card: card as unknown as HTMLElement, list, scrollIntoView: card.scrollIntoView };
}

describe("annotation card scrolling", () => {
  it("scrolls only the annotation list, not the card's outer dock ancestors", () => {
    const { card, list, scrollIntoView } = fixture();
    scrollAnnotationCard(card);
    expect(list.scrollTo).toHaveBeenCalledWith({ top: 228, behavior: "smooth" });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([
    { hidden: true },
    { visibility: "hidden" },
    { visibility: "collapse" },
    { rendered: false },
    { hasList: false },
  ])("does not scroll hidden/unmounted workbench cards: %j", (options) => {
    const { card, list, scrollIntoView } = fixture(options);
    scrollAnnotationCard(card);
    expect(list.scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([
    [120, 200, undefined], // Already fully visible.
    [50, 500, undefined], // Oversized card already spans the viewport.
    [50, 150, 28], // Reveal a card above the list.
    [150, 600, 128], // Oversized card below: align its top.
    [-200, 350, 28], // Oversized card above: align its bottom.
  ])("uses nearest-edge scrolling for bounds %i..%i", (top, bottom, expected) => {
    const { card, list } = fixture({ top, bottom });
    scrollAnnotationCard(card);
    if (expected === undefined) {
      expect(list.scrollTo).not.toHaveBeenCalled();
    } else {
      expect(list.scrollTo).toHaveBeenCalledWith({ top: expected, behavior: "smooth" });
    }
  });

  it("respects reduced motion", () => {
    const { card, list } = fixture({ reducedMotion: true });
    scrollAnnotationCard(card);
    expect(list.scrollTo).toHaveBeenCalledWith({ top: 228, behavior: "instant" });
  });
});
