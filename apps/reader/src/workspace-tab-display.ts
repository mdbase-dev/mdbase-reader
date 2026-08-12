import type { WorkspacePaneId, WorkspaceTab } from "./source-workspace-layout.js";
import type { SourceSummary } from "@mdbase-reader/core";

export function workspaceTabLabel(tab: WorkspaceTab, source: SourceSummary | null): string {
  if (tab.kind === "library") {
    return "VIEW";
  }
  if (tab.view === "note") {
    return "NOTE";
  }
  if (tab.view === "annotations") {
    return "MARKS";
  }
  return tab.view === "citation" ? "CSL" : source ? sourceFormat(source) : "SOURCE";
}

export function workspaceTabTitle(tab: WorkspaceTab, source: SourceSummary | null): string {
  return tab.kind === "library" ? tab.title : (source?.title ?? "Unavailable source");
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
  return source.documents[0] ? "FILE" : "NOTE";
}
