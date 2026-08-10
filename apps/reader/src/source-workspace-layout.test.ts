import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  activateSource,
  closeSource,
  createSourceWorkspaceLayout,
  focusPane,
  focusedPane,
  openSource,
  splitPane,
} from "./source-workspace-layout.js";

const first = sourceId("first");
const second = sourceId("second");
const third = sourceId("third");

describe("source workspace layout", () => {
  it("opens each source once and activates it in the focused pane", () => {
    const initial = createSourceWorkspaceLayout(first);
    const opened = openSource(openSource(initial, second), first);

    expect(focusedPane(opened)).toEqual({
      id: "primary",
      sourceIds: [first, second],
      activeSourceId: first,
    });
  });

  it("selects the neighbouring tab when the active source closes", () => {
    const opened = openSource(openSource(createSourceWorkspaceLayout(first), second), third);

    expect(focusedPane(closeSource(opened, third)).activeSourceId).toBe(second);
    expect(focusedPane(closeSource(opened, second)).activeSourceId).toBe(third);
  });

  it("can close the final tab without losing the pane", () => {
    const closed = closeSource(createSourceWorkspaceLayout(first), first);

    expect(focusedPane(closed)).toEqual({
      id: "primary",
      sourceIds: [],
      activeSourceId: null,
    });
  });

  it("keeps independent tab sets and selection when a pane is split", () => {
    const primary = openSource(createSourceWorkspaceLayout(first), second);
    const split = splitPane(primary, third);
    const refocused = focusPane(split, "primary");
    const activated = activateSource(refocused, first);

    expect(activated.panes).toEqual([
      { id: "primary", sourceIds: [first, second], activeSourceId: first },
      { id: "pane-2", sourceIds: [third], activeSourceId: third },
    ]);
    expect(activated.focusedPaneId).toBe("primary");
  });
});
