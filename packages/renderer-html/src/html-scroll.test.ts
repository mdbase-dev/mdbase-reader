import { expect, it, vi } from "vitest";

import { scrollHtmlElement } from "./html-scroll.js";

it.each([
  ["start", false, 2000, 2976, "smooth"],
  ["center", false, 2000, 2720, "smooth"],
  ["start", true, 2000, 2976, "instant"],
  ["center", true, 2000, 2720, "instant"],
  ["start", false, -1000, 0, "smooth"],
] as const)(
  "scrolls %s in one frame-local operation (reduced motion: %s)",
  (alignment, reduced, top, destination, behavior) => {
    const scrollTo = vi.fn();
    const scrollBy = vi.fn();
    const scrollIntoView = vi.fn();
    const view = {
      scrollY: 1000,
      innerHeight: 600,
      matchMedia: () => ({ matches: reduced }),
      scrollTo,
      scrollBy,
    } as unknown as Window;
    const element = {
      getBoundingClientRect: () => ({ top, height: 40 }),
      scrollIntoView,
    } as unknown as Element;
    scrollHtmlElement(view, element, alignment);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: destination, behavior });
    expect(scrollBy).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  },
);
