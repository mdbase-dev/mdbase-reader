// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { annotationId } from "@mdbase-reader/core";
import { afterEach, expect, it, vi } from "vitest";

import { MarginMarkers } from "./margin-markers.js";

let markers: MarginMarkers | undefined;
afterEach(() => {
  markers?.destroy();
  i18n.activate("en");
  document.body.replaceChildren();
});

it("updates existing marker tooltips on activation without translating document text", () => {
  const passage = document.createElement("p");
  passage.textContent = "User-authored passage";
  document.body.append(passage);
  const range = document.createRange();
  range.selectNodeContents(passage);
  vi.spyOn(range, "getClientRects").mockReturnValue([
    new DOMRect(10, 10, 100, 20),
  ] as unknown as DOMRectList);
  markers = new MarginMarkers(document, () => undefined);
  markers.set([{ id: annotationId("a"), range, hasNote: true }]);
  const marker = (): Element | null => document.querySelector("[data-annotation]");
  expect(marker()?.getAttribute("title")).toBe("Highlight with a note");
  const descriptor = msg({
    message: "Highlight with a note",
    context: "Reading margin marker tooltip",
  });
  if (!descriptor.id) {
    throw new Error("Expected generated message ID");
  }
  i18n.load("fr", { [descriptor.id]: "Surlignage avec une note" });
  i18n.activate("fr");
  expect(marker()?.getAttribute("title")).toBe("Surlignage avec une note");
  expect(passage.textContent).toBe("User-authored passage");
});
