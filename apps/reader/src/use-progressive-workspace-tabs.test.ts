import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  createLibraryWorkspaceTab,
  createPane,
  createWorkspaceTab,
  type SourceWorkspaceLayout,
} from "./source-workspace-layout.js";
import { progressiveWorkspaceSessionKeys } from "./use-progressive-workspace-tabs.js";

describe("progressive workspace hydration", () => {
  it("leaves restored inactive documents dormant while hydrating active and lightweight tabs", () => {
    const activeDocument = createWorkspaceTab(sourceId("active"));
    const inactiveDocument = createWorkspaceTab(sourceId("inactive"));
    const annotations = createWorkspaceTab(sourceId("active"), "annotations");
    const library = createLibraryWorkspaceTab();
    const primary = {
      ...createPane("primary", activeDocument),
      tabs: [inactiveDocument, activeDocument, annotations, library],
    };
    const layout: SourceWorkspaceLayout = {
      version: 2,
      panes: [primary],
      focusedPaneId: "primary",
      splitDirection: null,
      splitRatio: 0.5,
      recentlyClosed: [],
      recentSourceIds: [],
    };

    expect(progressiveWorkspaceSessionKeys(layout)).toEqual([
      `primary:${activeDocument.id}`,
      `primary:${annotations.id}`,
      `primary:${library.id}`,
    ]);
  });

  it("hydrates the active document in each restored pane", () => {
    const primaryDocument = createWorkspaceTab(sourceId("primary"));
    const secondaryDocument = createWorkspaceTab(sourceId("secondary"));
    const layout: SourceWorkspaceLayout = {
      version: 2,
      panes: [createPane("primary", primaryDocument), createPane("secondary", secondaryDocument)],
      focusedPaneId: "secondary",
      splitDirection: "horizontal",
      splitRatio: 0.5,
      recentlyClosed: [],
      recentSourceIds: [],
    };

    expect(progressiveWorkspaceSessionKeys(layout)).toEqual([
      `primary:${primaryDocument.id}`,
      `secondary:${secondaryDocument.id}`,
    ]);
  });
});
