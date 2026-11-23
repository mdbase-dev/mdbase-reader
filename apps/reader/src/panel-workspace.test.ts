import {
  computeLayout,
  edgeOfStack,
  mainStacks,
  stackOfPanel,
  toSnapshot,
} from "@mdbase-dev/panels";
import { describe, expect, it, vi } from "vitest";

import { navigatorPanelId } from "./panel-ids.js";
import { panelWorkspaceActions } from "./panel-workspace-actions.js";
import { followedPane, notesView, panelStorageKey } from "./panel-workspace-state.js";
import { ReaderPanelWorkspace } from "./panel-workspace.js";
import { createWorkspaceTab, type NotesView } from "./source-workspace-layout.js";

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
/** The Notes panel showing one of a source's tools. */
const notes = (workspace: ReaderPanelWorkspace, view: NotesView): string => {
  const panel = workspace.notesPanels().find((candidate) => notesView(candidate) === view);
  if (!panel) {
    throw new Error(`No Notes panel for ${view}`);
  }
  return panel.id;
};
const notesViewsOf = (workspace: ReaderPanelWorkspace): (NotesView | null)[] =>
  workspace.notesPanels().map(notesView);
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
    expect(workspace.isSidebarVisible("left")).toBe(true);
    expect(workspace.isSidebarVisible("right")).toBe(false);
    expect(notesViewsOf(workspace)).toEqual(["annotations", "note", "citation"]);
    expect(sideOfPanel(workspace, notes(workspace, "citation"))).toBe("right");
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
  it("gives a view a tab of its own beside a pinned library tab, and reuses an unpinned one", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    const views = (): (string | undefined)[] =>
      workspace.contentPanels().flatMap(({ id }) => {
        const tab = workspace.tab(id);
        return tab?.kind === "library" ? [tab.libraryViewId] : [];
      });
    workspace.open(one);
    // The library tab a workspace starts with is pinned to All sources.
    workspace.openLibrary("reading", "Reading");
    expect(titles(workspace)).toEqual(["library", `${one}:document`, "library"]);
    const tab = workspace.activeTab();
    expect(tab?.kind === "library" ? [tab.libraryViewId, tab.title] : null).toEqual([
      "reading",
      "Reading",
    ]);
    // The unpinned tab moves on to the next view; a view already open is gone to, not repeated.
    workspace.openLibrary("finished", "Finished");
    expect(views()).toEqual(["all-sources", "finished"]);
    workspace.openLibrary();
    expect(views()).toEqual(["all-sources", "finished"]);
    expect(workspace.activeTab()?.libraryViewId).toBe("all-sources");
    // A tab's own view switcher changes that tab, pinned or not.
    workspace.showLibraryView(workspace.activeTab()?.id ?? "", "reading", "Reading");
    expect(views()).toEqual(["reading", "finished"]);
    workspace.openLibraryTab("all-sources", "All sources");
    expect(views()).toEqual(["reading", "finished", "all-sources"]);
    // Asking for a new tab gives one, even for a view that already has a tab here.
    workspace.openLibraryTab("all-sources", "All sources");
    expect(views()).toEqual(["reading", "finished", "all-sources", "all-sources"]);
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

describe("two windows on one collection", () => {
  /** Windows share local storage, and each has session storage of its own. */
  const windows = (): ((session?: ReturnType<typeof memory>) => ReaderPanelWorkspace) => {
    const shared = memory();
    return (session = memory()) => {
      const workspace = new ReaderPanelWorkspace("preview", shared, known, true, session);
      sized(workspace, 1400);
      return workspace;
    };
  };
  it("gives a reloaded window its own layout back, and starts a new one from the last saved", () => {
    const open = windows();
    const session = memory();
    const first = open(session);
    first.open(one);
    first.store.flush();
    // A second window starts from what the first one saved.
    const second = open();
    expect(titles(second)).toEqual(["library", `${one}:document`]);
    second.open(two);
    second.split(idOf(second, two), "horizontal");
    second.store.flush();
    // The first window is not told, and reloading it brings back its own layout.
    expect(titles(first)).toEqual(["library", `${one}:document`]);
    const reloaded = open(session);
    expect(titles(reloaded)).toEqual(["library", `${one}:document`]);
    expect(mainStacks(reloaded.store.state)).toHaveLength(1);
    // A third window starts from the second, which saved last.
    const third = open();
    expect(titles(third)).toEqual(["library", `${one}:document`, `${two}:document`]);
    expect(mainStacks(third.store.state)).toHaveLength(2);
  });
  it("saves one envelope with the workspace and the tab in use", () => {
    const shared = memory();
    const workspace = new ReaderPanelWorkspace("preview", shared, known, true, memory());
    sized(workspace, 1400);
    workspace.open(three);
    workspace.store.flush();
    expect(JSON.parse(shared.getItem(panelStorageKey("preview")) ?? "")).toMatchObject({
      version: 1,
      workspace: toSnapshot(workspace.store.state),
      focusedPanel: idOf(workspace, three),
    });
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
    expect(workspace.isSideVisible(notes(workspace, "annotations"))).toBe(true);
    expect(workspace.isSideVisible(notes(workspace, "note"))).toBe(false);
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
    workspace.showNotes("note");
    expect(workspace.activePanel()?.id).toBe(notes(workspace, "note"));
    workspace.toggleSidebar("right");
    expect(workspace.activeTab()?.sourceId).toBe(one);
    sized(workspace, 390);
    workspace.toggleSidebar("right");
    expect(workspace.activePanel()?.id).toBe(notes(workspace, "note"));
    expect(workspace.isSidebarVisible("right")).toBe(true);
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
    // Working in a Notes panel is still reading.
    workspace.showNotes("annotations");
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
});

describe("side panels away from home", () => {
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
    // A Notes panel that was closed comes back when its side is opened empty; the others stay.
    const [annotations, note, citation] = workspace.notesPanels().map(({ id }) => id);
    for (const id of [annotations, note, citation]) {
      workspace.move(id ?? "", pane);
    }
    workspace.close(citation ?? "");
    workspace.toggleSidebar("right");
    expect(notesViewsOf(workspace)).toEqual(["annotations", "note", "citation"]);
    expect(sideOfPanel(workspace, notes(workspace, "citation"))).toBe("right");
    expect(sideOfPanel(workspace, annotations ?? "")).toBeNull();
    // With none closed, the ones elsewhere come home.
    workspace.move(notes(workspace, "citation"), pane);
    workspace.toggleSidebar("right");
    expect(workspace.notesPanels().map(({ id }) => sideOfPanel(workspace, id))).toEqual([
      "right",
      "right",
      "right",
    ]);
    // A tab can share a side region, and then the region is not a Notes panel's alone to close.
    workspace.open(two, "note");
    const tab = idOf(workspace, two, "note");
    workspace.store.dispatch({ type: "move", panel: tab, target: { at: "edge", side: "right" } });
    expect(sideOfPanel(workspace, tab)).toBe("right");
    workspace.setSideVisible(notes(workspace, "annotations"), false);
    expect(workspace.isSidebarVisible("right")).toBe(true);
  });
  it("goes to a Notes panel wherever it is, and brings back one that was closed", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.showNotes("citation");
    expect(workspace.isSidebarVisible("right")).toBe(true);
    expect(workspace.activePanel()?.id).toBe(notes(workspace, "citation"));
    workspace.close(notes(workspace, "citation"));
    expect(notesViewsOf(workspace)).toEqual(["annotations", "note"]);
    workspace.showNotes("citation");
    expect(notesViewsOf(workspace)).toEqual(["annotations", "note", "citation"]);
    // Resetting the arrangement brings every one of them back to the right.
    workspace.close(notes(workspace, "note"));
    workspace.move(notes(workspace, "annotations"), workspace.pane()?.id ?? "");
    workspace.reset();
    expect(notesViewsOf(workspace)).toHaveLength(3);
    expect(new Set(notesViewsOf(workspace))).toEqual(new Set(["annotations", "note", "citation"]));
    expect(workspace.notesPanels().every(({ id }) => sideOfPanel(workspace, id) === "right")).toBe(
      true,
    );
  });
});

describe("Notes panels and the source they show", () => {
  it("holds a pinned panel on its source as that source's tab, and follows again unpinned", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    const panel = notes(workspace, "note");
    // With no source to show there is nothing to pin it to.
    workspace.hold(panel);
    expect(workspace.tab(panel)).toBeNull();
    workspace.open(one);
    workspace.setSelected(one);
    workspace.hold(panel);
    expect(workspace.tab(panel)).toMatchObject({
      kind: "source",
      sourceId: one,
      view: "note",
      pinned: true,
      follow: true,
    });
    expect(notesViewsOf(workspace)).toEqual(["annotations", "citation"]);
    expect(sideOfPanel(workspace, panel)).toBe("right");
    // Pinned, it is a tab about its own source, as any note tab is.
    workspace.open(two);
    workspace.setSelected(two);
    expect(workspace.tab(panel)?.sourceId).toBe(one);
    workspace.activate(panel);
    expect(workspace.leaderTab()?.id).toBe(panel);
    workspace.activate(idOf(workspace, two));
    workspace.patch(panel, { pinned: false });
    expect(workspace.tab(panel)).toBeNull();
    expect(notesView(workspace.panel(panel))).toBe("note");
    expect(workspace.panel(panel)?.follows).toBe("leader");
  });
  it("turns a source's own tab into a Notes panel, once its changes are saved", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.open(one, "citation");
    const tab = workspace.activePanel()?.id ?? "";
    expect(workspace.leaderTab()?.id).toBe(tab);
    workspace.patch(tab, { dirty: true });
    workspace.follow(tab);
    expect(workspace.tab(tab)?.view).toBe("citation");
    workspace.patch(tab, { dirty: false });
    workspace.follow(tab);
    expect(workspace.tab(tab)).toBeNull();
    expect(notesView(workspace.panel(tab))).toBe("citation");
    // Using a Notes panel does not make it the tab the panels are about.
    expect(workspace.activePanel()?.id).toBe(tab);
    expect(workspace.leaderTab()?.view).toBe("document");
    expect(workspace.getSnapshot().panes.flatMap(({ tabs }) => tabs)).toHaveLength(2);
  });
  it("comes back after a reload as it was: following, or pinned to its source", () => {
    const storage = memory();
    const workspace = new ReaderPanelWorkspace("preview", storage, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.setSelected(one);
    const panel = notes(workspace, "annotations");
    workspace.hold(panel);
    workspace.store.flush();
    const restored = new ReaderPanelWorkspace("preview", storage, known);
    expect(restored.tab(panel)).toMatchObject({ follow: true, pinned: true, sourceId: one });
    expect(notesViewsOf(restored)).toEqual(["note", "citation"]);
    expect(restored.notesPanels().every(({ follows }) => follows === "leader")).toBe(true);
    // Its source deleted, the pinned tab goes; the panels that follow stay.
    const without = new ReaderPanelWorkspace("preview", storage, new Set([two]));
    expect(without.panel(panel)).toBeUndefined();
    expect(notesViewsOf(without)).toEqual(["note", "citation"]);
  });
  it("follows one pane, so two documents side by side each have their notes", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.open(two);
    workspace.split(idOf(workspace, two), "horizontal");
    const pane = (source: SourceId): string =>
      stackOfPanel(workspace.store.state, idOf(workspace, source))?.id ?? "";
    const panel = notes(workspace, "annotations");
    expect(workspace.sourceOf(panel)).toBe(two);
    workspace.setFollows(panel, { pane: pane(one) });
    expect(followedPane(workspace.panel(panel))).toBe(pane(one));
    expect(workspace.sourceOf(panel)).toBe(one);
    // Working in the other pane moves the panels that follow the reader, not this one.
    workspace.activate(idOf(workspace, two));
    expect(workspace.sourceOf(notes(workspace, "note"))).toBe(two);
    expect(workspace.sourceOf(panel)).toBe(one);
    // It shows whatever its pane shows, and a note tab there is about the same source.
    workspace.open(three, "document", pane(one));
    expect(workspace.sourceOf(panel)).toBe(three);
    // Pinned, it is the tab of the source its pane was showing.
    workspace.hold(panel);
    expect(workspace.tab(panel)).toMatchObject({ sourceId: three, pinned: true });
    workspace.patch(panel, { pinned: false });
    expect(workspace.panel(panel)?.follows).toBe("leader");
    workspace.setFollows(panel, { pane: pane(one) });
    workspace.reset();
    expect(workspace.panel(panel)?.follows).toBe("leader");
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
  it("opens beside as a pane to the right, or below", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    workspace.open(one);
    workspace.beside(createWorkspaceTab(two));
    const root = workspace.store.state.root;
    expect(root?.type === "split" ? root.direction : null).toBe("row");
    expect(mainStacks(workspace.store.state)).toHaveLength(2);
    workspace.beside(createWorkspaceTab(three), "vertical");
    expect(mainStacks(workspace.store.state)).toHaveLength(3);
    expect(stackOfPanel(workspace.store.state, idOf(workspace, three))?.panels).toHaveLength(1);
  });
});

describe("a source's note, annotations and citation", () => {
  it("open as the Notes panels beside the source's document, not as tabs", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 1400);
    const actions = panelWorkspaceActions(workspace);
    actions.openView(one, "note");
    expect(titles(workspace)).toEqual(["library", `${one}:document`]);
    expect(workspace.isSidebarVisible("right")).toBe(true);
    const panel = notes(workspace, "note");
    expect(stackOfPanel(workspace.store.state, panel)?.active).toBe(panel);
    actions.openView(two, "citation");
    expect(titles(workspace)).toEqual(["library", `${one}:document`, `${two}:document`]);
    expect(workspace.sourceOf(notes(workspace, "citation"))).toBe(two);
  });
  it("stay screens of the source's tab on a phone", () => {
    const workspace = new ReaderPanelWorkspace("preview", null, known);
    sized(workspace, 400);
    expect(workspace.mobile).toBe(true);
    panelWorkspaceActions(workspace).openView(one, "note");
    expect(titles(workspace)).toContain(`${one}:note`);
  });
});
