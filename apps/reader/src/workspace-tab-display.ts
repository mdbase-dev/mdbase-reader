import type { WorkspacePaneId, WorkspaceTab } from "./source-workspace-layout.js";
import type { SourceSummary } from "@mdbase-reader/core";

export function workspaceTabLabel(tab: WorkspaceTab, source: SourceSummary | null): string {
  if (tab.kind === "library") {
    return "Library";
  }
  if (tab.view === "note") {
    return "Literature note";
  }
  if (tab.view === "annotations") {
    return "Annotations";
  }
  return tab.view === "citation" ? "Citation" : source ? sourceFormat(source) : "Source";
}

export function workspaceTabTitle(tab: WorkspaceTab, source: SourceSummary | null): string {
  return tab.kind === "library" ? tab.title : (source?.title ?? "Unavailable source");
}

export function workspaceTabAccessibleTitle(
  tab: WorkspaceTab,
  source: SourceSummary | null,
): string {
  const title = workspaceTabTitle(tab, source);
  if (tab.kind === "source" && tab.view !== "document") {
    return `${workspaceTabLabel(tab, source)} — ${title}`;
  }
  return title;
}

export function workspacePaneName(paneId: WorkspacePaneId): string {
  return paneId === "primary" ? "A" : "B";
}

export function sourceFormat(source: SourceSummary): string {
  const mediaType = source.documents[0]?.mediaType ?? "";
  if (mediaType.includes("pdf")) {
    return "PDF";
  }
  if (mediaType.includes("epub")) {
    return "EPUB";
  }
  if (mediaType.includes("html")) {
    return "WEB";
  }
  return source.documents[0] ? "FILE" : "NO FILE";
}
