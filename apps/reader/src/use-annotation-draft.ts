import { useEffect, useSyncExternalStore } from "react";

import { hasUnsavedAnnotationEdits, subscribeAnnotationEdits } from "./unsaved-annotation-edits.js";

import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { WorkspaceTab } from "./source-workspace-layout.js";
import type { SourceSummary } from "@mdbase-reader/core";

export function useAnnotationDraftDirty(collection: string, source: string): boolean {
  const dirty = (): boolean => hasUnsavedAnnotationEdits(collection, source);
  return useSyncExternalStore(subscribeAnnotationEdits, dirty, dirty);
}
export function useDocumentAnnotationDirty(
  dock: ReaderDockWorkspace,
  tab: WorkspaceTab,
  source: SourceSummary | null | undefined,
): void {
  const dirty = useAnnotationDraftDirty(source?.collectionId ?? "", source?.id ?? "");
  useEffect(() => {
    if (tab.view === "document") {
      dock.patch(tab.id, { dirty });
    }
  }, [dirty, dock, tab.id, tab.view]);
}
