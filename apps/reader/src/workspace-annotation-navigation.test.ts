import { describe, expect, it } from "vitest";

import {
  createPane,
  createWorkspaceTab,
  type SourceWorkspaceLayout,
} from "./source-workspace-layout.js";
import { annotationDocumentTarget } from "./workspace-annotation-navigation.js";

import type { SourceId } from "@mdbase-reader/core";

const sourceId = "source-1" as SourceId;

function layout(
  primaryTabs = [createWorkspaceTab(sourceId, "annotations")],
  secondaryTabs = [createWorkspaceTab(sourceId, "document")],
): SourceWorkspaceLayout {
  const primary = createPane("primary");
  const secondary = createPane("secondary");
  return {
    version: 2,
    panes: [
      { ...primary, tabs: primaryTabs, activeTabId: primaryTabs[0]?.id ?? null },
      { ...secondary, tabs: secondaryTabs, activeTabId: secondaryTabs[0]?.id ?? null },
    ],
    focusedPaneId: "primary",
    splitDirection: "horizontal",
    splitRatio: 0.5,
    recentlyClosed: [],
    recentSourceIds: [sourceId],
  };
}

describe("annotationDocumentTarget", () => {
  it("prefers a document already open in the annotation pane", () => {
    const document = createWorkspaceTab(sourceId, "document");
    expect(
      annotationDocumentTarget(
        layout([createWorkspaceTab(sourceId, "annotations"), document]),
        sourceId,
        "primary",
      ),
    ).toEqual({ paneId: "primary", tabId: document.id });
  });

  it("uses an existing document in the adjacent pane", () => {
    const document = createWorkspaceTab(sourceId, "document");
    expect(annotationDocumentTarget(layout(undefined, [document]), sourceId, "primary")).toEqual({
      paneId: "secondary",
      tabId: document.id,
    });
  });

  it("opens a document in the annotation pane when none exists", () => {
    expect(annotationDocumentTarget(layout(undefined, []), sourceId, "primary")).toEqual({
      paneId: "primary",
      tabId: null,
    });
  });
});
