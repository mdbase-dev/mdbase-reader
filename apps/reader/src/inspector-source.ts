import type { WorkspaceTab } from "./source-workspace-layout.js";
import type { SourceSummary } from "@mdbase-reader/core";

/**
 * Library tabs have no source of their own, so keep the most recently selected source tools
 * available. Source tabs still require both workspace states to agree before showing context.
 */
export function inspectorSourceForTab(
  activeTab: WorkspaceTab | null,
  activeSource: SourceSummary | null,
  selectedSource: SourceSummary | null,
): SourceSummary | null {
  if (activeTab?.kind === "library") {
    return selectedSource;
  }
  return activeSource?.id === selectedSource?.id ? activeSource : null;
}
