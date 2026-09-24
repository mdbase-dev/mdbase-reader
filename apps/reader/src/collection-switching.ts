import { hasBlockingAnnotationDrafts } from "./annotation-drafts.js";
import { flushLocalDraftCheckpoints } from "./local-draft-checkpoint.js";
import { hasUnsavedAnnotationEdits } from "./unsaved-annotation-edits.js";

import type { SourceWorkspaceLayout } from "./source-workspace-layout.js";
import type { Source } from "@mdbase-reader/core";

/** A source deep link belongs to the old collection, not the next selection. */
export function collectionSwitchUrl(url: string): string {
  const next = new URL(url);
  next.searchParams.delete("source");
  return next.href;
}

export function confirmCollectionSwitch(
  layout: SourceWorkspaceLayout,
  sources: readonly Pick<Source, "collectionId" | "id">[],
  // Native confirmation keeps session switching synchronous with the user's decision.
  // eslint-disable-next-line no-alert
  confirm: (message: string) => boolean = (message) => globalThis.confirm(message),
): boolean {
  flushLocalDraftCheckpoints();
  const dirty =
    layout.panes.some((pane) => pane.tabs.some((tab) => tab.dirty)) ||
    sources.some(
      (source) =>
        hasUnsavedAnnotationEdits(source.collectionId, source.id) ||
        hasBlockingAnnotationDrafts(source.collectionId, source.id),
    );
  return (
    !dirty ||
    confirm("Switch collections with unsaved changes? Save your edits first to avoid losing work.")
  );
}
