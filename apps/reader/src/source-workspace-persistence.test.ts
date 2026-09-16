import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  createSourceWorkspaceLayout,
  createPane,
  createWorkspaceTab,
  createLibraryWorkspaceTab,
  focusedPane,
} from "./source-workspace-layout.js";
import {
  parseSourceWorkspace,
  persistSourceWorkspace,
  restoreSourceWorkspace,
  workspaceStorageKey,
} from "./source-workspace-persistence.js";

const first = sourceId("first");
const second = sourceId("second");
const known = new Set([first, second]);

describe("legacy v2 workspace migration input", () => {
  it("reads collection-level views alongside source tabs", () => {
    const layout = {
      ...createSourceWorkspaceLayout(first),
      panes: [
        {
          ...createPane("primary"),
          tabs: [
            createWorkspaceTab(first),
            {
              ...createLibraryWorkspaceTab("views/reading.md::queue", "Reading queue"),
              pinned: true,
            },
          ],
        },
      ],
    };
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
  it("reads previews, both panes, history and focused tabs without a legacy layout engine", () => {
    const primary = createPane("primary", createWorkspaceTab(first, "document", true));
    const split = {
      ...createSourceWorkspaceLayout(null),
      panes: [
        { ...primary, tabs: [...primary.tabs, createWorkspaceTab(second)] },
        createPane("secondary", createWorkspaceTab(second, "note")),
      ],
      focusedPaneId: "secondary",
      splitDirection: "vertical",
    };
    const restored = parseSourceWorkspace(JSON.parse(JSON.stringify(split)), known, first);
    expect(restored.splitDirection).toBe("vertical");
    expect(restored.focusedPaneId).toBe("secondary");
    expect(restored.panes.flatMap(({ tabs }) => tabs)).toHaveLength(3);
    expect(restored.panes[0]?.history.entries.length).toBeGreaterThan(0);
    expect(restored.panes[0]?.tabs[0]?.preview).toBe(true);
  });
  it("drops missing sources and never restores dirty flags", () => {
    const raw = {
      ...createSourceWorkspaceLayout(null),
      panes: [
        {
          ...createPane("primary"),
          tabs: [
            { ...createWorkspaceTab(first), dirty: true },
            { ...createWorkspaceTab(second), sourceId: "missing" },
          ],
        },
      ],
    };
    const restored = parseSourceWorkspace(raw, known, first);
    expect(focusedPane(restored).tabs).toHaveLength(1);
    expect(focusedPane(restored).tabs[0]).toMatchObject({ sourceId: first, dirty: false });
  });
  it("round trips legacy fixtures and survives corrupt storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const layout = {
      ...createSourceWorkspaceLayout(null),
      panes: [
        { ...createPane("primary"), tabs: [createWorkspaceTab(first), createWorkspaceTab(second)] },
      ],
    };
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
