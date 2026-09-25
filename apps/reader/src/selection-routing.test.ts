import { describe, expect, it } from "vitest";

import { selectionRoute } from "./selection-routing.js";

import type { ComposerSelection } from "./annotation-composer-request.js";

function text(exact: string, via?: "pointer" | "keyboard"): ComposerSelection {
  return {
    kind: "text",
    value: {
      target: { quote: { exact } },
      locator: { kind: "pdf", pageIndex: 0 },
      ...(via ? { via } : {}),
    },
  };
}
const area = { kind: "area", value: { pageIndex: 0 } } as unknown as ComposerSelection;
const base = { draft: null, paused: false, busy: false, instant: false };

describe("selectionRoute", () => {
  it("offers actions for a fresh text selection instead of starting a draft", () => {
    expect(selectionRoute({ ...base, value: text("A passage") })).toBe("toolbar");
  });

  it("highlights at once when the reader chose that, but not while extending by keyboard", () => {
    expect(selectionRoute({ ...base, instant: true, value: text("A", "pointer") })).toBe(
      "highlight",
    );
    expect(selectionRoute({ ...base, instant: true, value: text("A", "keyboard") })).toBe(
      "toolbar",
    );
  });

  it("ignores the same passage reported again", () => {
    const value = text("A passage");
    expect(selectionRoute({ ...base, draft: { body: "", selection: value }, value })).toBe(
      "ignore",
    );
  });

  it("keeps a comment being written and offers to move it instead", () => {
    const draft = { body: "My words", selection: text("First") };
    expect(selectionRoute({ ...base, draft, value: text("Second") })).toBe("offer-switch");
  });

  it("lets a set-aside comment wait while new text gets the toolbar", () => {
    const draft = { body: "My words", selection: text("First") };
    expect(selectionRoute({ ...base, draft, paused: true, value: text("Second") })).toBe("toolbar");
  });

  it("opens the composer for an area, confirming before replacing written words", () => {
    expect(selectionRoute({ ...base, value: area })).toBe("compose");
    const draft = { body: "My words", selection: text("First") };
    expect(selectionRoute({ ...base, draft, paused: true, value: area })).toBe("confirm-compose");
  });
});
