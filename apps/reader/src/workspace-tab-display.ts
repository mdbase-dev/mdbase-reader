import { t as translate } from "@lingui/core/macro";

import type { WorkspacePaneId, WorkspaceTab } from "./source-workspace-layout.js";
import type { SourceSummary } from "@mdbase-reader/core";

export function workspaceTabLabel(tab: WorkspaceTab, source: SourceSummary | null): string {
  if (tab.kind === "library") {
    return translate({ message: "Library", context: "workspace tab display" });
  }
  if (tab.view === "note") {
    return translate({ message: "Source note" });
  }
  if (tab.view === "annotations") {
    return translate({ message: "Annotations", context: "workspace tab display" });
  }
  return tab.view === "citation"
    ? translate({ message: "Citation", context: "workspace tab display" })
    : source
      ? sourceFormat(source)
      : translate({ message: "Source", context: "workspace tab display" });
}

export function workspaceTabTitle(tab: WorkspaceTab, source: SourceSummary | null): string {
  if (tab.kind === "library") {
    // Only the unsaved built-in view has a translated title; saved view names are user data.
    return tab.libraryViewId === "all-sources" ? workspaceTabLabel(tab, source) : tab.title;
  }
  return source?.title ?? translate({ message: "Unavailable source" });
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
    return translate({ message: "WEB", context: "Source format badge for saved web pages" });
  }
  return source.documents[0]
    ? translate({ message: "FILE", context: "workspace tab display" })
    : translate({ message: "NO FILE", context: "workspace tab display" });
}
