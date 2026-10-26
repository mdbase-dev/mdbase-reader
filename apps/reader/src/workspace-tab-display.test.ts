import { readerI18n } from "@mdbase-reader/i18n";
import { describe, expect, it } from "vitest";

import { navigatorPanelId, inspectorPanelId } from "./dockview-panel-ids.js";
import { sidePanelTitle } from "./dockview-side-panels.js";
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
  path: "sources/crime-and-punishment.md",
  title: "Crime and Punishment",
  creators: [],
  tags: [],
  documents: [{ mediaType: "application/pdf" }],
} as unknown as SourceSummary;

describe("workspace tab display", () => {
  it("refreshes built-in titles with real catalogues without translating saved names", async () => {
    const library = createLibraryWorkspaceTab();
    const saved = createLibraryWorkspaceTab("saved.md::my-view", "My reading");
    try {
      await readerI18n.selectLocale("de");
      expect(workspaceTabAccessibleTitle(library, null)).toBe("Bibliothek");
      expect(sidePanelTitle(navigatorPanelId)).toBe("Quellen");
      expect(sidePanelTitle(inspectorPanelId)).toBe("Notizen");
      await readerI18n.selectLocale("ja");
      expect(workspaceTabAccessibleTitle(library, null)).toBe("ライブラリ");
      expect(sidePanelTitle(navigatorPanelId)).toBe("資料");
      expect(workspaceTabAccessibleTitle(saved, null)).toBe("My reading");
      expect(workspaceTabTitle(createWorkspaceTab(source.id), source)).toBe(source.title);
    } finally {
      await readerI18n.selectLocale("en");
    }
  });
  it("names research tools in reader language instead of storage formats", () => {
    const citation = createWorkspaceTab(source.id, "citation");
    const annotations = createWorkspaceTab(source.id, "annotations");

    expect(workspaceTabLabel(citation, source)).toBe("Citation");
    expect(workspaceTabLabel(annotations, source)).toBe("Annotations");
    expect(workspaceTabAccessibleTitle(citation, source)).toBe("Citation — Crime and Punishment");
  });

  it("keeps documents and library views titled by their content", () => {
    const document = createWorkspaceTab(source.id, "document");
    const library = createLibraryWorkspaceTab("saved.md::my-view", "All sources");

    expect(workspaceTabTitle(document, source)).toBe("Crime and Punishment");
    expect(workspaceTabAccessibleTitle(document, source)).toBe("Crime and Punishment");
    expect(workspaceTabAccessibleTitle(library, null)).toBe("All sources");
  });
});
