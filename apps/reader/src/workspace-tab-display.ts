import { t } from "@lingui/core/macro";

import type { WorkspacePaneId, WorkspaceTab } from "./source-workspace-layout.js";
import type { SourceSummary } from "@mdbase-reader/core";

export function workspaceTabLabel(tab: WorkspaceTab, source: SourceSummary | null): string {
  if (tab.kind === "library") {
    return t({ message: "Library", context: "workspace tab display" });
  }
  if (tab.view === "note") {
    return t({ message: "Literature note", context: "workspace tab display" });
  }
  if (tab.view === "annotations") {
    return t({ message: "Annotations", context: "workspace tab display" });
  }
  return tab.view === "citation"
    ? t({ message: "Citation", context: "workspace tab display" })
    : source
      ? sourceFormat(source)
      : t({ message: "Source", context: "workspace tab display" });
}

export function workspaceTabTitle(tab: WorkspaceTab, source: SourceSummary | null): string {
  return tab.kind === "library"
    ? tab.title
    : (source?.title ?? t({ message: "Unavailable source" }));
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
    return t({ message: "WEB", context: "Source format badge for saved web pages" });
  }
  return source.documents[0]
    ? t({ message: "FILE", context: "workspace tab display" })
    : t({ message: "NO FILE", context: "workspace tab display" });
}
