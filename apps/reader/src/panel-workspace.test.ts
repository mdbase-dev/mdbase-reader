import { computeLayout, edgeOfStack, mainStacks, stackOfPanel } from "@mdbase-dev/panels";
import { describe, expect, it, vi } from "vitest";

import { inspectorPanelId, navigatorPanelId } from "./panel-ids.js";
import { panelStorageKey } from "./panel-workspace-state.js";
import { ReaderPanelWorkspace } from "./panel-workspace.js";
import { createWorkspaceTab } from "./source-workspace-layout.js";

import type { SourceId } from "@mdbase-reader/core";

const one = "source-one" as SourceId;
const two = "source-two" as SourceId;
const three = "source-three" as SourceId;
const known = new Set([one, two, three]);

function memory(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}
function sized(workspace: ReaderPanelWorkspace, width: number): void {
  workspace.layoutChanged(
    computeLayout(workspace.store.state, { width, height: 800 }, workspace.layoutOptions()),
  );
}
const titles = (workspace: ReaderPanelWorkspace): string[] =>
  workspace.contentPanels().map(({ id }) => {
    const tab = workspace.tab(id);
    return tab?.kind === "source" ? `${tab.sourceId}:${tab.view}` : "library";
  });
/** What is saved about each side: whether the reader wants it open. */
const wanted = (workspace: ReaderPanelWorkspace): { left?: boolean; right?: boolean } => ({
  ...(workspace.store.state.edges.left ? { left: workspace.store.state.edges.left.visible } : {}),
  ...(workspace.store.state.edges.right
    ? { right: workspace.store.state.edges.right.visible }
    : {}),
});
const sideOfPanel = (workspace: ReaderPanelWorkspace, panel: string): string | null => {
  const stack = stackOfPanel(workspace.store.state, panel);
  return stack ? edgeOfStack(workspace.store.state, stack.id) : null;
};
const idOf = (workspace: ReaderPanelWorkspace, source: SourceId, view = "document"): string => {
  const panel = workspace.contentPanels().find(({ id }) => {
    const tab = workspace.tab(id);
    return tab?.kind === "source" && tab.sourceId === source && tab.view === view;
  });
  if (!panel) {
    throw new Error(`No tab for ${source}`);
  }
  return panel.id;
};

describe("a new workspace", () => {
  it("starts with a pinned library tab, the sources beside it and the notes closed", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    expect(titles(workspace)).toEqual(["library"]);
    expect(workspace.activeTab()?.pinned).toBe(true);
    expect(workspace.view).toBe("columns");
    expect(workspace.isSidebarVisible("left")).toBe(true);
    expect(workspace.isSidebarVisible("right")).toBe(false);
    expect(workspace.panel(inspectorPanelId)).toBeDefined();
  });
  it("ignores layouts saved by earlier workspaces and anything it cannot read", () => {
    const storage = memory();
    storage.setItem(
      "mdbase-reader:dockview:v1:preview",
      JSON.stringify({ version: 2, layout: {} }),
    );
    storage.setItem(panelStorageKey("preview"), "{broken");
    const workspace = new ReaderPanelWorkspace("preview", storage, known);
    expect(titles(workspace)).toEqual(["library"]);
  });
});

describe("tabs", () => {
  it("shows another library view in the library tab that is already open", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    workspace.open(one);
    workspace.openLibrary("reading", "Reading");
    expect(titles(workspace)).toEqual(["library", `${one}:document`]);
    const tab = workspace.activeTab();
    expect(tab?.kind === "library" ? [tab.libraryViewId, tab.title] : null).toEqual([
      "reading",
      "Reading",
    ]);
  });
  it("replaces the previous preview in place, and keeps a tab once it is opened for good", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    workspace.open(one, "document", undefined, true);
    workspace.open(two, "document", undefined, true);
    expect(titles(workspace)).toEqual(["library", `${two}:document`]);
    workspace.open(two);
    expect(workspace.activeTab()?.preview).toBe(false);
    workspace.open(three, "document", undefined, true);
    expect(titles(workspace)).toEqual(["library", `${two}:document`, `${three}:document`]);
  });
  it("keeps one citation form for a source, moving it rather than opening a second", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one, "citation");
    const citation = idOf(workspace, one, "citation");
    workspace.beside(createWorkspaceTab(one, "citation"));
    expect(titles(workspace).filter((title) => title === `${one}:citation`)).toHaveLength(1);
    expect(mainStacks(workspace.store.state)).toHaveLength(2);
    expect(workspace.paneOf(citation)?.panels).toEqual([citation]);
  });
  it("reopens a closed tab under its own identity", async () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    workspace.open(one);
    const id = idOf(workspace, one);
    workspace.close(id);
    await Promise.resolve();
    expect(titles(workspace)).toEqual(["library"]);
    workspace.reopen();
    expect(idOf(workspace, one)).toBe(id);
  });
  it("asks about every unsaved tab before closing any of a batch", async () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    workspace.open(one);
    workspace.open(two);
    const ids = [idOf(workspace, one), idOf(workspace, two)];
    ids.forEach((id) => workspace.patch(id, { dirty: true }));
    const answers = [true, false];
    const guard = vi.fn(() => Promise.resolve(answers.shift() ?? false));
    workspace.setCloseGuard(guard);
    workspace.closeMany(ids);
    await vi.waitFor(() => expect(guard).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(titles(workspace)).toHaveLength(3);
    workspace.setCloseGuard(() => true);
    workspace.closeMany(ids);
    await vi.waitFor(() => expect(titles(workspace)).toEqual(["library"]));
  });
});

describe("what is saved", () => {
  it("restores tabs and arrangement, never unsaved-changes flags, and drops deleted sources", () => {
    const storage = memory();
    const workspace = new ReaderPanelWorkspace("preview", storage, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.open(two);
    workspace.split(idOf(workspace, two), "horizontal");
    workspace.patch(idOf(workspace, one), { dirty: true });
    workspace.patch(idOf(workspace, two), { pinned: true });
    workspace.store.flush();
    const saved = storage.getItem(panelStorageKey("preview")) ?? "";
    expect(saved).not.toContain("dirty");
    const restored = new ReaderPanelWorkspace("preview", storage, known);
    expect(titles(restored)).toEqual(["library", `${one}:document`, `${two}:document`]);
    expect(mainStacks(restored.store.state)).toHaveLength(2);
    expect(restored.tab(idOf(restored, one))?.dirty).toBe(false);
    expect(restored.tab(idOf(restored, two))?.pinned).toBe(true);
    const without = new ReaderPanelWorkspace("preview", storage, new Set([one]));
    expect(titles(without)).toEqual(["library", `${one}:document`]);
  });
  it("does not create panels of kinds it does not know from saved data", () => {
    const storage = memory();
    const workspace = new ReaderPanelWorkspace("preview", storage, known);
    workspace.open(one);
    workspace.store.flush();
    const key = panelStorageKey("preview");
    storage.setItem(
      key,
      (storage.getItem(key) ?? "").replaceAll('"kind":"navigator"', '"kind":"script"'),
    );
    const restored = new ReaderPanelWorkspace("preview", storage, known);
    expect(Object.values(restored.store.state.panels).map(({ kind }) => kind)).not.toContain(
      "script",
    );
    expect(titles(restored)).toEqual(["library", `${one}:document`]);
    restored.toggleSidebar("left");
    expect(restored.panel(navigatorPanelId)?.kind).toBe("navigator");
  });
});

describe("side panels", () => {
  it("closes a side panel by hiding its side, and brings it back on the next toggle", async () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.close(navigatorPanelId);
    await Promise.resolve();
    expect(workspace.panel(navigatorPanelId)).toBeDefined();
    expect(workspace.isSidebarVisible("left")).toBe(false);
    workspace.toggleSidebar("left");
    expect(workspace.isSidebarVisible("left")).toBe(true);
    workspace.toggleSidebar("right");
    expect(workspace.isSideVisible(inspectorPanelId)).toBe(true);
  });
  it("lets the notes give way in a narrow window, unless they were asked for last", () => {
    const storage = memory();
    const earlier = new ReaderPanelWorkspace("preview", storage, known);
    earlier.toggleSidebar("right");
    earlier.store.flush();
    const workspace = new ReaderPanelWorkspace("preview", storage, known);
    sized(workspace, 800);
    expect(workspace.isSidebarVisible("left")).toBe(true);
    expect(workspace.isSidebarVisible("right")).toBe(false);
    workspace.toggleSidebar("right");
    expect(workspace.isSidebarVisible("right")).toBe(true);
    expect(workspace.isSidebarVisible("left")).toBe(false);
    // Giving way is not closing: both come back once there is room.
    expect(wanted(workspace)).toEqual({ left: true, right: true });
    sized(workspace, 1400);
    expect(workspace.isSidebarVisible("left")).toBe(true);
    expect(workspace.isSidebarVisible("right")).toBe(true);
  });
  it("treats a side panel opened on a phone as a screen, not as a change to the desktop", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.toggleSidebar("left");
    expect(workspace.isSidebarVisible("left")).toBe(false);
    sized(workspace, 390);
    expect(workspace.mobile).toBe(true);
    workspace.toggleSidebar("left");
    expect(workspace.isSideVisible(navigatorPanelId)).toBe(true);
    expect(workspace.activeTab()).toBeNull();
    workspace.toggleSidebar("left");
    expect(workspace.activeTab()?.kind).toBe("source");
    expect(workspace.panel(navigatorPanelId)).toBeDefined();
    sized(workspace, 1400);
    expect(workspace.isSidebarVisible("left")).toBe(false);
  });
  it("hands focus back to the tab in use when a side closes or stops being a phone's screen", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.setSideVisible(inspectorPanelId, true);
    expect(workspace.activePanel()?.id).toBe(inspectorPanelId);
    workspace.toggleSidebar("right");
    expect(workspace.activeTab()?.sourceId).toBe(one);
    sized(workspace, 390);
    workspace.toggleSidebar("right");
    expect(workspace.activePanel()?.id).toBe(inspectorPanelId);
    sized(workspace, 1400);
    expect(workspace.isSidebarVisible("right")).toBe(false);
    expect(workspace.activeTab()?.sourceId).toBe(one);
  });
  it("makes way for a document on screen without forgetting that the reader wants Sources", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.setHideWhileReading(true);
    expect(workspace.isSidebarVisible("left")).toBe(true);
    workspace.open(one);
    expect(workspace.isSidebarVisible("left")).toBe(false);
    expect(wanted(workspace).left).toBe(true);
    // Working in the Notes panel is still reading.
    workspace.setSideVisible(inspectorPanelId, true);
    expect(workspace.isSidebarVisible("left")).toBe(false);
    // The reader can look at Sources anyway, and put it away again, without changing the rule.
    workspace.toggleSidebar("left");
    expect(workspace.isSidebarVisible("left")).toBe(true);
    workspace.toggleSidebar("left");
    expect(workspace.isSidebarVisible("left")).toBe(false);
    expect(wanted(workspace).left).toBe(true);
    const library = workspace
      .contentPanels()
      .find(({ id }) => workspace.tab(id)?.kind === "library");
    workspace.activate(library?.id ?? "");
    expect(workspace.isSidebarVisible("left")).toBe(true);
    workspace.setHideWhileReading(false);
    workspace.activate(idOf(workspace, one));
    expect(workspace.isSidebarVisible("left")).toBe(true);
  });
  it("lets Sources and Notes live anywhere, and brings one home when its side is opened empty", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    const pane = workspace.pane()?.id ?? "";
    workspace.move(navigatorPanelId, pane);
    expect(sideOfPanel(workspace, navigatorPanelId)).toBeNull();
    expect(workspace.isSidebarVisible("left")).toBe(false);
    // In a pane it is a tab like any other: closing it removes it.
    workspace.close(navigatorPanelId);
    expect(workspace.panel(navigatorPanelId)).toBeUndefined();
    workspace.toggleSidebar("left");
    expect(sideOfPanel(workspace, navigatorPanelId)).toBe("left");
    expect(workspace.isSidebarVisible("left")).toBe(true);
    workspace.move(inspectorPanelId, pane);
    workspace.toggleSidebar("right");
    expect(sideOfPanel(workspace, inspectorPanelId)).toBe("right");
    // A tab can share a side region, and then the region is not Notes' alone to close.
    workspace.open(two, "note");
    const note = idOf(workspace, two, "note");
    workspace.store.dispatch({ type: "move", panel: note, target: { at: "edge", side: "right" } });
    expect(sideOfPanel(workspace, note)).toBe("right");
    workspace.setSideVisible(inspectorPanelId, false);
    expect(workspace.isSidebarVisible("right")).toBe(true);
  });
});

describe("following the active document", () => {
  it("shows the source of the tab last worked in, and stays put while pinned", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.open(one, "note");
    const note = workspace.activePanel()?.id ?? "";
    workspace.setFollow(note, true);
    workspace.split(note, "horizontal");
    const follow = (): void => {
      const leader = workspace.leaderTab();
      workspace.setFollowed(leader?.kind === "source" ? leader.sourceId : null);
    };
    // Using the following tab does not make it the active document.
    expect(workspace.activePanel()?.id).toBe(note);
    expect(workspace.leaderTab()?.view).toBe("document");
    workspace.activate(idOf(workspace, one));
    workspace.open(two);
    follow();
    expect(workspace.tab(note)?.sourceId).toBe(two);
    workspace.patch(note, { pinned: true });
    workspace.open(three);
    follow();
    expect(workspace.tab(note)?.sourceId).toBe(two);
    // Pinned, it is a tab about its own source, as any note tab is.
    workspace.activate(note);
    expect(workspace.leaderTab()?.id).toBe(note);
    workspace.activate(idOf(workspace, three));
    workspace.patch(note, { pinned: false });
    expect(workspace.tab(note)?.sourceId).toBe(three);
  });
  it("waits for unsaved changes before moving on, and comes back following after a reload", () => {
    const storage = memory();
    const workspace = new ReaderPanelWorkspace("preview", storage, known);
    sized(workspace, 1400);
    workspace.open(one, "annotations");
    const tab = workspace.activePanel()?.id ?? "";
    workspace.setFollow(tab, true);
    workspace.patch(tab, { dirty: true });
    workspace.setFollowed(two);
    expect(workspace.tab(tab)?.sourceId).toBe(one);
    workspace.patch(tab, { dirty: false });
    expect(workspace.tab(tab)?.sourceId).toBe(two);
    workspace.store.flush();
    const restored = new ReaderPanelWorkspace("preview", storage, known);
    expect(restored.tab(tab)).toMatchObject({ follow: true, sourceId: two, view: "annotations" });
    expect(restored.panel(tab)?.leads).toBe(false);
  });
  it("is for notes and annotations: a citation form belongs to one source", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    workspace.open(one, "citation");
    const tab = workspace.activePanel()?.id ?? "";
    workspace.setFollow(tab, true);
    expect(workspace.tab(tab)).not.toHaveProperty("follow");
  });
});

describe("arrangement", () => {
  it("undoes a rearrangement without closing tabs opened since", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one);
    expect(workspace.canUndo).toBe(false);
    workspace.split(idOf(workspace, one), "horizontal");
    expect(mainStacks(workspace.store.state)).toHaveLength(2);
    workspace.open(two);
    workspace.undo();
    expect(mainStacks(workspace.store.state)).toHaveLength(1);
    expect(titles(workspace)).toContain(`${two}:document`);
    workspace.redo();
    expect(mainStacks(workspace.store.state)).toHaveLength(2);
    expect(titles(workspace)).toHaveLength(3);
  });
  it("resets to one pane with every tab, and focus mode fills the workspace with one pane", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.split(idOf(workspace, one), "vertical");
    workspace.setSinglePane(true);
    expect(workspace.store.state.maximized).not.toBeNull();
    expect(workspace.isSidebarVisible("left")).toBe(false);
    workspace.setSinglePane(false);
    expect(workspace.store.state.maximized).toBeNull();
    workspace.reset();
    expect(mainStacks(workspace.store.state)).toHaveLength(1);
    expect(titles(workspace)).toHaveLength(2);
  });
  it("opens beside as a new column when panes scroll, and as a split when they are fitted", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.beside(createWorkspaceTab(two));
    workspace.setView("tiling");
    workspace.beside(createWorkspaceTab(three), "vertical");
    const root = workspace.store.state.root;
    expect(root?.type === "split" ? root.direction : null).toBe("row");
    expect(mainStacks(workspace.store.state)).toHaveLength(3);
  });
  it("moves to the canvas with every pane where it was, and opens beside without covering one", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.setView("tiling");
    workspace.open(one);
    workspace.beside(createWorkspaceTab(two));
    const before = computeLayout(
      workspace.store.state,
      { width: 1400, height: 800 },
      workspace.layoutOptions(),
    );
    workspace.setView("canvas");
    const frames = (): { x: number; y: number; width: number; height: number }[] =>
      mainStacks(workspace.store.state).map(({ id }) => {
        const frame = workspace.store.state.canvas.frames[id];
        if (!frame) {
          throw new Error(`No frame for ${id}`);
        }
        return frame;
      });
    const main = before.stacks.filter(({ edge }) => edge === null);
    frames().forEach((frame, index) => {
      const was = main[index]?.rect ?? { x: 0, y: 0, width: 0, height: 0 };
      // Seeded from the tiled layout, with a small gap so panes read as separate.
      expect(Math.abs(frame.x - (was.x - before.main.x))).toBeLessThan(16);
      expect(Math.abs(frame.width - was.width)).toBeLessThan(32);
    });
    workspace.beside(createWorkspaceTab(three));
    const placed = frames();
    expect(placed).toHaveLength(3);
    for (const [index, frame] of placed.entries()) {
      for (const other of placed.slice(index + 1)) {
        const apart =
          frame.x + frame.width <= other.x ||
          other.x + other.width <= frame.x ||
          frame.y + frame.height <= other.y ||
          other.y + other.height <= frame.y;
        expect(apart).toBe(true);
      }
    }
  });
});
