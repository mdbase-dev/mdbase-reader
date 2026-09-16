import {
  collectionId,
  fileId,
  fileRevision,
  sourceId,
  type SourceSummary,
} from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { continueReadingSource, readingLocationLabel } from "./ContinueReading.js";
import { searchExcerpt } from "./search-passages.js";
import {
  createPane,
  createWorkspaceTab,
  type SourceWorkspaceLayout,
} from "./source-workspace-layout.js";
import {
  retainedWorkspaceSessionKeys,
  workspaceSessionKey,
} from "./use-progressive-workspace-tabs.js";
import { parseShellPreferences } from "./workspace-shell-preferences.js";

const source: SourceSummary = {
  collectionId: collectionId("test"),
  id: sourceId("test"),
  path: "test.md",
  title: "Test",
  creators: [],
  tags: [],
  readingStatus: "reading",
  documents: [
    {
      fileId: fileId("test"),
      file: "[[test.pdf]]",
      mediaType: "application/pdf",
      revision: fileRevision(`sha256:${"a".repeat(64)}`),
      role: "primary",
    },
  ],
};

describe("reading defaults and search excerpts", () => {
  it("chooses recently opened, unfinished readable sources", () => {
    const finished = { ...source, readingStatus: "finished" as const };
    const note = { ...source, documents: [] };
    expect(continueReadingSource([finished, note, source])).toBe(source);
    expect(continueReadingSource([finished, note])).toBeNull();
  });
  it("labels PDF pages and HTML progress without requiring a separate progress field", () => {
    expect(
      readingLocationLabel({
        ...source,
        reading: { status: "reading", position: { kind: "pdf", pageIndex: 41 } },
      }),
    ).toBe("Page 42");
    expect(
      readingLocationLabel({
        ...source,
        reading: { status: "reading", position: { kind: "html", href: "test", progression: 0.42 } },
      }),
    ).toContain("42%");
  });
  it("defaults to comfortable density and validates saved values", () => {
    expect(parseShellPreferences(null).density).toBe("comfortable");
    expect(parseShellPreferences({ density: "compact" }).density).toBe("compact");
    expect(parseShellPreferences({ density: "broken" }).density).toBe("comfortable");
  });
  it("keeps passage casing and whitespace-normalized matches as plain text", () => {
    expect(searchExcerpt("Before PATIENT\nattention after", "patient attention")).toEqual({
      before: "Before ",
      match: "PATIENT attention",
      after: " after",
    });
    expect(searchExcerpt("Text", "")).toBeNull();
    expect(searchExcerpt("Text", "absent")).toBeNull();
  });
});

describe("bounded renderer residency", () => {
  it("evicts old documents, preserving active split panes and dirty notes", () => {
    const tabs = Array.from({ length: 20 }, (_, index) =>
      createWorkspaceTab(sourceId(`test_${String(index)}`)),
    );
    const note = { ...createWorkspaceTab(source.id, "note"), dirty: true };
    const primary = { ...createPane("primary", tabs[19]), tabs: [...tabs, note] };
    const secondary = createPane("secondary", createWorkspaceTab(source.id));
    const layout: SourceWorkspaceLayout = {
      version: 2,
      panes: [primary, secondary],
      focusedPaneId: "primary",
      splitDirection: "horizontal",
      splitRatio: 0.5,
      recentlyClosed: [],
      recentSourceIds: [],
    };
    const current = new Set(primary.tabs.map((tab) => workspaceSessionKey("primary", tab.id)));
    const kept = retainedWorkspaceSessionKeys(layout, current);
    expect(kept.size).toBe(5); // Four documents and the dirty note.
    expect(kept.has(workspaceSessionKey("primary", note.id))).toBe(true);
    expect(kept.has(workspaceSessionKey("primary", tabs[19]!.id))).toBe(true);
    expect(kept.has(workspaceSessionKey("secondary", secondary.activeTabId!))).toBe(true);
    expect(kept.has(workspaceSessionKey("primary", tabs[0]!.id))).toBe(false);
  });
});
