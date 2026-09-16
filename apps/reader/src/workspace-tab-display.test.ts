import { describe, expect, it } from "vitest";

import { createLibraryWorkspaceTab, createWorkspaceTab } from "./source-workspace-layout.js";
import {
  workspaceTabAccessibleTitle,
  workspaceTabLabel,
  workspaceTabTitle,
} from "./workspace-tab-display.js";

import type { SourceId, SourceSummary } from "@mdbase-reader/core";

const source = {
  id: "source-1" as SourceId,
  collectionId: "collection-1",
  path: "sources/gravity-and-grace.md",
  title: "Gravity and Grace",
  creators: [],
  tags: [],
  documents: [{ mediaType: "application/pdf" }],
} as unknown as SourceSummary;

describe("workspace tab display", () => {
  it("names research tools in reader language instead of storage formats", () => {
    const citation = createWorkspaceTab(source.id, "citation");
    const annotations = createWorkspaceTab(source.id, "annotations");

    expect(workspaceTabLabel(citation, source)).toBe("Citation");
    expect(workspaceTabLabel(annotations, source)).toBe("Annotations");
    expect(workspaceTabAccessibleTitle(citation, source)).toBe("Citation — Gravity and Grace");
  });

  it("keeps documents and library views titled by their content", () => {
    const document = createWorkspaceTab(source.id, "document");
    const library = createLibraryWorkspaceTab("all-sources", "All sources");

    expect(workspaceTabTitle(document, source)).toBe("Gravity and Grace");
    expect(workspaceTabAccessibleTitle(document, source)).toBe("Gravity and Grace");
    expect(workspaceTabAccessibleTitle(library, null)).toBe("All sources");
  });
});
