import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { navigateWorkspaceHistory } from "./source-workspace-history.js";
import {
  activeTab,
  createSourceWorkspaceLayout,
  focusedPane,
  paneById,
  workspaceTabId,
} from "./source-workspace-layout.js";
import {
  closeSecondaryPane,
  focusPane,
  moveWorkspaceTabToPane,
  openBeside,
  resizeWorkspaceSplit,
  splitWorkspaceTab,
} from "./source-workspace-panes.js";
import {
  closeOtherWorkspaceTabs,
  closeSource,
  closeWorkspaceTabsToRight,
  reopenClosedWorkspaceTab,
} from "./source-workspace-tab-closing.js";
import {
  activateSource,
  matchingWorkspaceTabs,
  openSource,
  openWorkspaceTab,
  previewSource,
  promoteWorkspaceTab,
  reorderWorkspaceTab,
  setWorkspaceTabDirty,
  setWorkspaceTabPinned,
} from "./source-workspace-tabs.js";

const first = sourceId("first");
const second = sourceId("second");
const third = sourceId("third");
const fourth = sourceId("fourth");

describe("source workspace tabs", () => {
  it("reuses one preview tab while browsing", () => {
    const initial = createSourceWorkspaceLayout(null);
    const firstPreview = previewSource(initial, first);
    const secondPreview = previewSource(firstPreview, second);

    expect(focusedPane(secondPreview).tabs).toEqual([
      expect.objectContaining({ sourceId: second, preview: true }),
    ]);
    expect(activeTab(focusedPane(secondPreview))?.sourceId).toBe(second);
  });

  it("promotes previews through interaction, pinning, or edits", () => {
    const preview = previewSource(createSourceWorkspaceLayout(null), first);
    const id = workspaceTabId(first, "document");

    expect(activeTab(focusedPane(promoteWorkspaceTab(preview, id)))?.preview).toBe(false);
    expect(activeTab(focusedPane(setWorkspaceTabPinned(preview, id, true)))).toMatchObject({
      pinned: true,
      preview: false,
    });
    expect(activeTab(focusedPane(setWorkspaceTabDirty(preview, id, true)))).toMatchObject({
      dirty: true,
      preview: false,
    });
  });

  it("keeps promoted tabs when the next source is previewed", () => {
    const firstPreview = previewSource(createSourceWorkspaceLayout(null), first);
    const promoted = promoteWorkspaceTab(firstPreview, workspaceTabId(first, "document"));
    const next = previewSource(promoted, second);

    expect(focusedPane(next).tabs.map(({ sourceId }) => sourceId)).toEqual([first, second]);
  });

  it("closes neighbouring tabs and reopens the most recently closed tab", () => {
    const opened = openSource(openSource(createSourceWorkspaceLayout(first), second), third);
    const closed = closeSource(opened, third);

    expect(activeTab(focusedPane(closed))?.sourceId).toBe(second);
    expect(activeTab(focusedPane(reopenClosedWorkspaceTab(closed)))?.sourceId).toBe(third);
  });

  it("pins tabs across close-others and close-to-right actions", () => {
    const opened = openSource(
      openSource(openSource(createSourceWorkspaceLayout(first), second), third),
      fourth,
    );
    const pinned = setWorkspaceTabPinned(opened, workspaceTabId(third, "document"), true);
    const rightClosed = closeWorkspaceTabsToRight(pinned, workspaceTabId(second, "document"));
    const othersClosed = closeOtherWorkspaceTabs(pinned, workspaceTabId(second, "document"));

    expect(focusedPane(rightClosed).tabs.map(({ sourceId }) => sourceId)).toEqual([
      first,
      second,
      third,
    ]);
    expect(focusedPane(othersClosed).tabs.map(({ sourceId }) => sourceId)).toEqual([second, third]);
  });

  it("reorders tabs and filters the searchable switcher", () => {
    const opened = openSource(openSource(createSourceWorkspaceLayout(first), second), third);
    const reordered = reorderWorkspaceTab(opened, "primary", 2, 0);
    const matches = matchingWorkspaceTabs(reordered, "sec", (id) => `${id} title`);

    expect(focusedPane(reordered).tabs.map(({ sourceId }) => sourceId)).toEqual([
      third,
      first,
      second,
    ]);
    expect(matches.map(({ sourceId }) => sourceId)).toEqual([second]);
  });

  it("moves back and forward through source history", () => {
    const opened = openSource(openSource(createSourceWorkspaceLayout(first), second), third);
    const back = navigateWorkspaceHistory(opened, -1);
    const furtherBack = navigateWorkspaceHistory(back, -1);
    const forward = navigateWorkspaceHistory(furtherBack, 1);

    expect(activeTab(focusedPane(back))?.sourceId).toBe(second);
    expect(activeTab(focusedPane(furtherBack))?.sourceId).toBe(first);
    expect(activeTab(focusedPane(forward))?.sourceId).toBe(second);
  });
});

describe("source workspace panes", () => {
  it("opens document and source tools beside one another", () => {
    const split = openBeside(createSourceWorkspaceLayout(first), first, "note", "horizontal");

    expect(split.splitDirection).toBe("horizontal");
    expect(paneById(split, "primary")?.tabs[0]).toMatchObject({
      sourceId: first,
      view: "document",
    });
    expect(paneById(split, "secondary")?.tabs[0]).toMatchObject({
      sourceId: first,
      view: "note",
    });
  });

  it("joins an existing split and keeps pane-local active tabs", () => {
    const split = openBeside(createSourceWorkspaceLayout(first), second, "document", "vertical");
    const joined = openBeside(focusPane(split, "primary"), third, "citation", "vertical");

    expect(joined.panes).toHaveLength(2);
    expect(activeTab(paneById(joined, "primary") ?? focusedPane(joined))?.sourceId).toBe(first);
    expect(activeTab(paneById(joined, "secondary") ?? focusedPane(joined))).toMatchObject({
      sourceId: third,
      view: "citation",
    });
  });

  it("moves a tab between panes and can create a split by dragging", () => {
    const opened = openSource(createSourceWorkspaceLayout(first), second);
    const split = splitWorkspaceTab(
      opened,
      workspaceTabId(second, "document"),
      "primary",
      "horizontal",
    );
    const movedBack = moveWorkspaceTabToPane(
      split,
      workspaceTabId(second, "document"),
      "secondary",
      "primary",
    );

    expect(paneById(split, "primary")?.tabs.map(({ sourceId }) => sourceId)).toEqual([first]);
    expect(paneById(split, "secondary")?.tabs.map(({ sourceId }) => sourceId)).toEqual([second]);
    expect(paneById(movedBack, "primary")?.tabs.map(({ sourceId }) => sourceId)).toEqual([
      first,
      second,
    ]);
  });

  it("clamps split resizing and merges secondary tabs without losing them", () => {
    const split = openBeside(createSourceWorkspaceLayout(first), second);
    const resized = resizeWorkspaceSplit(split, 0.95);
    const merged = closeSecondaryPane(resized);

    expect(resized.splitRatio).toBe(0.72);
    expect(merged.splitDirection).toBeNull();
    expect(merged.panes).toHaveLength(1);
    expect(focusedPane(merged).tabs.map(({ sourceId }) => sourceId)).toEqual([first, second]);
  });

  it("opens multiple views of a source as distinct tabs", () => {
    const document = createSourceWorkspaceLayout(first);
    const withNote = openWorkspaceTab(document, first, { view: "note" });

    expect(focusedPane(withNote).tabs.map(({ view }) => view)).toEqual(["document", "note"]);
    expect(activeTab(focusedPane(activateSource(withNote, first)))?.view).toBe("document");
  });
});
