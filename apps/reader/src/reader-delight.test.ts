import { describe, expect, it } from "vitest";

import { composerPlacement } from "./AnnotationComposerLayer.js";
import { droppedMediaType } from "./use-source-addition.js";

const layer = { left: 100, top: 50, width: 800, height: 700 };

describe("annotation composer placement", () => {
  it("opens below the selection, centred on it", () => {
    expect(composerPlacement(layer, { x: 400, y: 200, width: 200, height: 20 }, 160)).toEqual({
      left: 210,
      top: 180,
      width: 380,
    });
  });

  it("opens above a selection near the bottom of the page", () => {
    const style = composerPlacement(layer, { x: 400, y: 680, width: 200, height: 20 }, 160);
    expect(style?.top).toBe(680 - 50 - 10 - 160);
  });

  it("stays inside the document at its edges", () => {
    expect(composerPlacement(layer, { x: 102, y: 200, width: 10, height: 20 }, 160)?.left).toBe(12);
  });

  it("docks instead when the pane is too narrow to float a card", () => {
    expect(
      composerPlacement({ ...layer, width: 250 }, { x: 150, y: 200, width: 50, height: 20 }, 160),
    ).toBeNull();
  });
});

describe("dropped files", () => {
  it("accepts readable formats by type or extension and rejects the rest", () => {
    expect(droppedMediaType({ name: "paper.PDF", type: "" })).toBe("application/pdf");
    expect(droppedMediaType({ name: "book.epub", type: "" })).toBe("application/epub+zip");
    expect(droppedMediaType({ name: "saved.html", type: "text/html" })).toBe("text/html");
    expect(droppedMediaType({ name: "notes.docx", type: "application/msword" })).toBeNull();
  });
});
