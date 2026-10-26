import { t as translate } from "@lingui/core/macro";

import { hasBlockingAnnotationDrafts } from "./annotation-drafts.js";
import { requestConfirmation, type ConfirmationOptions } from "./confirmation.js";
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

export async function confirmCollectionSwitch(
  layout: SourceWorkspaceLayout,
  sources: readonly Pick<Source, "collectionId" | "id">[],
  confirm: (options: ConfirmationOptions) => boolean | Promise<boolean> = requestConfirmation,
): Promise<boolean> {
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
    confirm({
      title: translate({ message: "Switch collections?" }),
      message: translate({
        message:
          "Some edits have not reached the collection. Drafts are local to this device, not saved to the collection, and switching may interrupt pending saves. Finish your edits first to avoid losing work.",
      }),
      confirmLabel: translate({ message: "Switch anyway" }),
      cancelLabel: "Stay",
    })
  );
}
