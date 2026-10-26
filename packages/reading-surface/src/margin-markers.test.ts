// @vitest-environment happy-dom
import { annotationId } from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { MarginMarkers } from "./margin-markers.js";

it("finds the nearest resolved passage using cached layout coordinates, including after reflow", () => {
  document.body.innerHTML = "<p>First passage.</p><p>Second passage.</p>";
  const markers = new MarginMarkers(document, vi.fn());
  const layer = document.querySelector<HTMLElement>('[data-mdbase-reader="margin"]')!;
  let scroll = 0;
  vi.spyOn(layer, "getBoundingClientRect").mockImplementation(
    () => ({ top: -scroll, left: 0 }) as DOMRect,
  );
  const range = (index: number, y: () => number): Range => {
    const value = document.createRange();
    value.selectNodeContents(document.querySelectorAll("p")[index]!);
    vi.spyOn(value, "getClientRects").mockImplementation(
      () =>
        [
          { top: y() - scroll, bottom: y() - scroll + 20, left: 20, height: 20 } as DOMRect,
        ] as unknown as DOMRectList,
    );
    return value;
  };
  let secondTop = 1000;
  const first = range(0, () => 20);
  const second = range(1, () => secondTop);
  markers.set([
    { id: annotationId("first"), range: first, hasNote: false },
    { id: annotationId("second"), range: second, hasNote: true },
  ]);
  const reads = vi.mocked(second.getClientRects).mock.calls.length;
  expect(markers.nearest()).toBe("first");
  scroll = 900;
  expect(markers.nearest()).toBe("second");
  expect(second.getClientRects).toHaveBeenCalledTimes(reads);
  secondTop = 2000;
  markers.layout();
  expect(markers.nearest()).toBe("first");
  markers.destroy();
  expect(markers.nearest()).toBeNull();
});
