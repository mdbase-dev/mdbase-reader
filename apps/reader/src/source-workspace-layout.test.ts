import { sourceId } from "@mdbase-reader/core";
import { expect, it } from "vitest";

import {
  activeTab,
  createLibraryWorkspaceTab,
  createPane,
  createSourceWorkspaceLayout,
  createWorkspaceTab,
  focusedPane,
  sourceIdsInWorkspace,
  workspaceTabSourceId,
} from "./source-workspace-layout.js";

it("keeps source identity distinct from a Dockview session and group identity", () => {
  const source = sourceId("source-one");
  const tab = { ...createWorkspaceTab(source), id: "reader:session:one" };
  const pane = createPane("arbitrary-dockview-group", tab);
  const layout = { ...createSourceWorkspaceLayout(null), panes: [pane], focusedPaneId: pane.id };
  expect(focusedPane(layout)).toBe(pane);
  expect(activeTab(pane)).toBe(tab);
  expect(workspaceTabSourceId(tab)).toBe(source);
});
it("lists each source once even when multiple independent sessions are open", () => {
  const source = sourceId("source-one");
  const layout = {
    ...createSourceWorkspaceLayout(null),
    panes: [
      createPane("left", { ...createWorkspaceTab(source), id: "reader:session:one" }),
      createPane("right", { ...createWorkspaceTab(source, "note"), id: "reader:session:two" }),
      createPane("library", createLibraryWorkspaceTab()),
    ],
  };
  expect(sourceIdsInWorkspace(layout)).toEqual([source]);
  expect(workspaceTabSourceId(createLibraryWorkspaceTab())).toBeNull();
});
it("provides a safe empty projection while Dockview initializes or all panels close", () => {
  const layout = createSourceWorkspaceLayout(null);
  expect(activeTab(focusedPane(layout))).toBeNull();
  expect(sourceIdsInWorkspace(layout)).toEqual([]);
});
