import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  createSourceWorkspaceLayout,
  focusedPane,
  workspaceTabId,
} from "./source-workspace-layout.js";
import { openBeside } from "./source-workspace-panes.js";
import {
  parseSourceWorkspace,
  persistSourceWorkspace,
  restoreSourceWorkspace,
  workspaceStorageKey,
} from "./source-workspace-persistence.js";
import {
  openLibraryTab,
  openSource,
  previewSource,
  setWorkspaceTabDirty,
} from "./source-workspace-tabs.js";

const first = sourceId("first");
const second = sourceId("second");
const known = new Set([first, second]);

describe("source workspace persistence", () => {
  it("persists collection-level mdbase view tabs alongside source tabs", () => {
    const layout = openLibraryTab(createSourceWorkspaceLayout(first), "views/reading.md::queue", {
      title: "Reading queue",
      pinned: true,
    });
    const restored = parseSourceWorkspace(JSON.parse(JSON.stringify(layout)), known, null);
    expect(focusedPane(restored).tabs).toEqual([
      expect.objectContaining({ kind: "source", sourceId: first }),
      expect.objectContaining({
        kind: "library",
        libraryViewId: "views/reading.md::queue",
        title: "Reading queue",
        pinned: true,
      }),
    ]);
  });

  it("restores open tabs, previews, split layout, history, and focus", () => {
    const opened = previewSource(openSource(createSourceWorkspaceLayout(first), second), first);
    const split = openBeside(opened, second, "note", "vertical");
    const restored = parseSourceWorkspace(
      JSON.parse(JSON.stringify(split)) as unknown,
      known,
      first,
    );

    expect(restored.splitDirection).toBe("vertical");
    expect(restored.focusedPaneId).toBe("secondary");
    expect(restored.panes.flatMap(({ tabs }) => tabs)).toHaveLength(3);
    expect(restored.panes[0]?.history.entries.length).toBeGreaterThan(0);
  });

  it("drops missing sources and never restores dirty state", () => {
    const dirty = setWorkspaceTabDirty(
      createSourceWorkspaceLayout(first),
      workspaceTabId(first, "document"),
      true,
    );
    const raw = JSON.parse(JSON.stringify(dirty)) as {
      panes: { tabs: { sourceId: string }[] }[];
    };
    raw.panes[0]?.tabs.push({ sourceId: "missing" });
    const restored = parseSourceWorkspace(raw, known, first);

    expect(focusedPane(restored).tabs).toHaveLength(1);
    expect(focusedPane(restored).tabs[0]).toMatchObject({ sourceId: first, dirty: false });
  });

  it("round trips through a storage adapter and survives corrupt storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const layout = openSource(createSourceWorkspaceLayout(first), second);

    persistSourceWorkspace(storage, "collection", layout);
    expect(restoreSourceWorkspace(storage, "collection", known, first).panes[0]?.tabs).toHaveLength(
      2,
    );

    values.set(workspaceStorageKey("collection"), "not-json");
    expect(
      focusedPane(restoreSourceWorkspace(storage, "collection", known, first)).tabs,
    ).toHaveLength(1);
  });
});
