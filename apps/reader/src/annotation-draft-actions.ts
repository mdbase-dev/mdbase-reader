import { t as translate } from "@lingui/core/macro";

import { saveSelection } from "./annotation-selection.js";
import { requestConfirmation } from "./confirmation.js";

import type { AnnotationLocalDraft } from "./annotation-drafts.js";
import type { Annotation, AnnotationCreationRequest, Source } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export function annotationEditorKeys(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "defaultPrevented" | "preventDefault" | "stopPropagation"
  >,
  dismiss: () => void,
  save: () => void,
): void {
  if (event.defaultPrevented) {
    return;
  }
  const action =
    event.key === "Escape"
      ? dismiss
      : (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s"
        ? save
        : null;
  if (action) {
    event.preventDefault();
    event.stopPropagation();
    action();
  }
}

export function confirmAnnotationDiscard(message: string): Promise<boolean> {
  return requestConfirmation({
    title: translate({ message: "Discard draft?" }),
    message,
    confirmLabel: translate({ message: "Discard draft" }),
    cancelLabel: translate({ message: "Keep editing" }),
    danger: true,
  });
}
export async function saveAnnotationDraftToCollection(
  clear: () => void,
  draft: AnnotationLocalDraft,
  source: Source,
  surface: ReadingSurface,
  create: (request: AnnotationCreationRequest) => Promise<Annotation>,
  problem: (value: { sourceId: string; message: string }) => void,
  done: () => void,
): Promise<void> {
  if (!draft.selection) {
    done();
    return;
  }
  await saveSelection(
    { source, surface, create },
    draft.selection,
    draft.body,
    () => {
      clear();
      surface.capabilities.textSelection?.clearSelection();
    },
    problem,
    done,
  );
}
