import { computeLayout, mainStacks } from "@mdbase-dev/panels";
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
  it("lets the notes give way before the sources when the window is narrow", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    workspace.toggleSidebar("right");
    sized(workspace, 800);
    expect(workspace.isSidebarVisible("left")).toBe(true);
    expect(workspace.isSidebarVisible("right")).toBe(false);
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
});
