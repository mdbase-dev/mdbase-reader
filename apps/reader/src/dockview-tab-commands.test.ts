import { describe, expect, it, vi } from "vitest";

import { addDockTab, openDockTab, patchDockTab } from "./dockview-tab-commands.js";
import { createWorkspaceTab } from "./source-workspace-layout.js";

import type { SourceId } from "@mdbase-reader/core";
import type { DockviewApi, DockviewGroupPanel } from "dockview-react";

const source = "source-one" as SourceId;
describe("Dockview session commands", () => {
  it("reuses a writable tool in another group rather than creating a competing editor", () => {
    const tab = { ...createWorkspaceTab(source, "note"), id: "reader:session:existing" };
    const existing = { id: tab.id, params: { tab }, api: { setActive: vi.fn(), moveTo: vi.fn() } };
    const api = {
      panels: [existing],
      getPanel: () => existing,
      addPanel: vi.fn(),
    } as unknown as DockviewApi;
    openDockTab(api, createWorkspaceTab(source, "note"));
    expect(existing.api.setActive).toHaveBeenCalledOnce();
    expect(api.addPanel).not.toHaveBeenCalled();
    addDockTab(
      api,
      createWorkspaceTab(source, "note"),
      { id: "destination" } as DockviewGroupPanel,
      "horizontal",
    );
    expect(existing.api.moveTo).toHaveBeenCalledWith({
      group: { id: "destination" },
      position: "right",
    });
    expect(api.addPanel).not.toHaveBeenCalled();
  });
  it("keeps the session identity when reopening, but creates a new identity for duplicates", () => {
    const tab = { ...createWorkspaceTab(source), id: "reader:session:closed" };
    const addPanel = vi.fn();
    const api = { panels: [], getPanel: () => undefined, addPanel } as unknown as DockviewApi;
    addDockTab(api, tab);
    expect(addPanel.mock.calls[0]?.[0].id).toBe(tab.id);
    const occupied = {
      panels: [],
      addPanel,
      getPanel: (id: string) => (id === tab.id ? { id: tab.id } : undefined),
    } as unknown as DockviewApi;
    addDockTab(occupied, tab);
    expect(addPanel.mock.calls[1]?.[0].id).not.toBe(tab.id);
  });
  it("adds a replacement preview before removing the old one, protecting the group", () => {
    const old = {
      id: "old-preview",
      params: { tab: createWorkspaceTab("old" as SourceId, "document", true) },
    };
    const operations: string[] = [];
    const api = {
      panels: [old],
      getPanel: () => undefined,
      addPanel: () => operations.push("add"),
      removePanel: () => operations.push("remove"),
    } as unknown as DockviewApi;
    openDockTab(api, createWorkspaceTab(source, "document", true), {
      panels: [old],
    } as unknown as DockviewGroupPanel);
    expect(operations).toEqual(["add", "remove"]);
  });
  it("promotes dirty/pinned tabs and avoids duplicate parameter events", () => {
    const tab = { ...createWorkspaceTab(source, "note", true), id: "reader:session:note" };
    const panel = { params: { tab }, api: { updateParameters: vi.fn() } };
    const api = { getPanel: () => panel } as unknown as DockviewApi;
    expect(patchDockTab(api, tab.id, { dirty: true })).toBe(true);
    expect(panel.api.updateParameters).toHaveBeenCalledWith({
      tab: { ...tab, dirty: true, preview: false },
    });
    expect(patchDockTab(api, tab.id, { dirty: false })).toBe(false);
  });
});
