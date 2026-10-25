import { describe, expect, it } from "vitest";

import { selectionRoute } from "./selection-routing.js";

import type { ComposerSelection } from "./annotation-composer-request.js";

function text(exact: string, via?: "pointer" | "keyboard" | "touch"): ComposerSelection {
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
const base = { draft: null, busy: false, instant: false };

describe("selectionRoute", () => {
  it("offers actions for a fresh text selection instead of starting a draft", () => {
    expect(selectionRoute({ ...base, value: text("A passage") })).toBe("toolbar");
  });

  it("highlights at once when the reader chose that, but not while a selection can still grow", () => {
    expect(selectionRoute({ ...base, instant: true, value: text("A", "pointer") })).toBe(
      "highlight",
    );
    expect(selectionRoute({ ...base, instant: true, value: text("A", "keyboard") })).toBe(
      "toolbar",
    );
    expect(selectionRoute({ ...base, instant: true, value: text("A", "touch") })).toBe("toolbar");
  });

  it("ignores the same passage reported again", () => {
    const value = text("A passage");
    expect(selectionRoute({ ...base, draft: { body: "", selection: value }, value })).toBe(
      "ignore",
    );
  });

  it("gives new text the toolbar while a written comment stays in the composer", () => {
    // No more "Use it for this comment" or setting the comment aside: they live side by side.
    const draft = { body: "My words", selection: area };
    expect(selectionRoute({ ...base, draft, value: text("Second") })).toBe("toolbar");
    expect(selectionRoute({ ...base, draft, instant: true, value: text("Third") })).toBe(
      "highlight",
    );
  });

  it("still offers actions while the composer's draft is saving", () => {
    const draft = { body: "My words", selection: text("First") };
    expect(selectionRoute({ ...base, draft, busy: true, value: text("Second") })).toBe("toolbar");
    expect(selectionRoute({ ...base, busy: true, instant: true, value: text("Third") })).toBe(
      "highlight",
    );
  });

  it("opens the composer for an area, confirming before replacing written words", () => {
    expect(selectionRoute({ ...base, value: area })).toBe("compose");
    const draft = { body: "My words", selection: text("First") };
    expect(selectionRoute({ ...base, draft, value: area })).toBe("confirm-compose");
    const other = { kind: "area", value: { pageIndex: 1 } } as unknown as ComposerSelection;
    expect(selectionRoute({ ...base, draft: { body: "  ", selection: area }, value: other })).toBe(
      "compose",
    );
    expect(selectionRoute({ ...base, draft, busy: true, value: area })).toBe("ignore");
  });
});
