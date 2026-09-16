import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { annotationEditorKeys } from "./annotation-draft-actions.js";
import { browseAnnotations } from "./annotation-list-order.js";
import { navigateToAnnotation } from "./annotation-navigation.js";

import type { Annotation } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";
const base: Annotation = {
  id: annotationId("a"),
  collectionId: collectionId("c"),
  sourceId: sourceId("s"),
  source: "[[s]]",
  annotationType: "highlight",
  body: "> Quoted passage",
  tags: [],
  createdAt: dateTime("2026-01-01T00:00:00Z"),
};
function pdf(id: string, pageIndex: number, y: number): Annotation {
  return {
    ...base,
    id: annotationId(id),
    target: {
      pdf: {
        pageIndex,
        coordinateSpace: { profile: "test", origin: "top_left", box: "crop" },
        quadPoints: [[0, y, 20, y, 0, y + 10, 20, y + 10]],
      },
    },
  };
}
it("orders PDF passages by page and vertical position, not creation sequence", () => {
  const values = [pdf("late", 10, 0), pdf("low", 2, 40), pdf("high", 2, 10)];
  expect(browseAnnotations(values, "", "all", "document").map(({ id }) => id)).toEqual([
    "high",
    "low",
    "late",
  ]);
});
it("orders HTML offsets in the same text basis and puts unlocated annotations last", () => {
  const position = (start: number): NonNullable<Annotation["target"]> => ({
    textPosition: {
      basis: { profile: "test", hash: "text" },
      unit: "unicode_code_point",
      start,
      end: start + 10,
    },
  });
  const values = [
    base,
    { ...base, id: annotationId("later"), target: position(100) },
    { ...base, id: annotationId("earlier"), target: position(2) },
  ];
  expect(browseAnnotations(values, "", "all", "document").map(({ id }) => id)).toEqual([
    "earlier",
    "later",
    "a",
  ]);
});
it("filters authored comments rather than quotation-only annotations", () => {
  const comment = {
    ...base,
    id: annotationId("comment"),
    body: "> Passage\n\nA useful observation.",
  };
  expect(browseAnnotations([base, comment], "USEFUL", "comments", "document")).toEqual([comment]);
  expect(browseAnnotations([base], "", "comments", "document")).toEqual([]);
  expect(browseAnnotations([base, comment], "missing", "all", "newest")).toEqual([]);
});
it("uses numeric EPUB CFI ordering rather than lexical page ordering", () => {
  const later = {
    ...base,
    id: annotationId("later"),
    target: { epub: { cfi: "epubcfi(/6/10[chapter]!/4/2:0)" } },
  };
  const earlier = {
    ...base,
    id: annotationId("earlier"),
    target: { epub: { cfi: "epubcfi(/6/2[chapter]!/4/2:0)" } },
  };
  expect(browseAnnotations([later, earlier], "", "all", "document")).toEqual([earlier, later]);
});
it("delegates save and dismiss keys without stealing a handled completion-menu Escape", () => {
  const dismiss = vi.fn(),
    save = vi.fn();
  const event = {
    key: "Escape",
    ctrlKey: false,
    metaKey: false,
    defaultPrevented: true,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  annotationEditorKeys(event, dismiss, save);
  expect(dismiss).not.toHaveBeenCalled();
  annotationEditorKeys({ ...event, defaultPrevented: false }, dismiss, save);
  expect(dismiss).toHaveBeenCalledOnce();
  annotationEditorKeys(
    { ...event, key: "s", metaKey: true, defaultPrevented: false },
    dismiss,
    save,
  );
  expect(save).toHaveBeenCalledOnce();
});

it("reports missing passages and rejects failed navigation instead of silently succeeding", async () => {
  const goTo = vi.fn().mockResolvedValue(false);
  const surface = { goTo, capabilities: {} } as unknown as ReadingSurface;
  await expect(navigateToAnnotation(pdf("pdf", 1, 0), surface)).rejects.toThrow("Could not locate");
  goTo.mockRejectedValue(new Error("Renderer failed"));
  await expect(navigateToAnnotation(pdf("pdf", 1, 0), surface)).rejects.toThrow("Renderer failed");
  goTo.mockResolvedValue(true);
  await expect(navigateToAnnotation(pdf("pdf", 1, 0), surface)).resolves.toBeUndefined();
});
