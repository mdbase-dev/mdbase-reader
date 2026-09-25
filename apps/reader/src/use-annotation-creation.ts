import { useEffect, useState, useSyncExternalStore } from "react";

import { annotationCreationBuffer } from "./annotation-creation-buffer.js";
import { confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import { annotationDraftKey } from "./annotation-drafts.js";
import { useAreaSelectionMode } from "./use-area-selection-mode.js";
import { useCreationSaving } from "./use-creation-saving.js";
import { useSelectionRouting } from "./use-selection-routing.js";

import type { ComposerSelection } from "./annotation-composer-request.js";
import type { SelectionToolbarController, TextComposerSelection } from "./use-selection-toolbar.js";
import type { Annotation, AnnotationCreationRequest, Source, SourceId } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface AnnotationCreationInput {
  readonly sourceId: SourceId | null;
  readonly source: Source | null;
  readonly surface: ReadingSurface | null;
  readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
}
export interface AnnotationCreationController {
  readonly selection: ComposerSelection | null;
  readonly note: string;
  readonly status: "idle" | "saving";
  readonly error: string | null;
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  readonly resumeDraft: (() => void) | null;
  /** A selection made while a comment was being written; the comment keeps its passage. */
  readonly newSelection: boolean;
  readonly useNewSelection: () => void;
  readonly pause: () => void;
  readonly setNote: (note: string) => void;
  readonly dismiss: () => void;
  readonly save: () => void;
  /** Saves a selection as a highlight at once, without a comment. */
  readonly highlight: (selection: TextComposerSelection) => void;
  /** Opens the composer to comment on a selection. */
  readonly comment: (selection: TextComposerSelection) => void;
  readonly toggleAreaSelection: () => void;
}
function creationKey(source: Source | null, surface: ReadingSurface | null): string {
  return source && surface
    ? annotationDraftKey(source.collectionId, source.id, JSON.stringify(surface.document.document))
    : "";
}
export function useAnnotationCreation(
  input: AnnotationCreationInput,
  onSelection: () => void,
  toolbar: SelectionToolbarController,
  onCreated: (annotation: Annotation) => void,
): AnnotationCreationController {
  const { sourceId, source, surface, create } = input;
  const key = creationKey(source, surface);
  const buffer = annotationCreationBuffer(
    key,
    source ? { collectionId: source.collectionId, sourceId: source.id } : undefined,
  );
  const draft = useSyncExternalStore(buffer.subscribe, buffer.getSnapshot, buffer.getSnapshot);
  useEffect(() => buffer.start(), [buffer]);
  const saving = useCreationSaving({
    source,
    surface,
    buffer,
    create,
    onCreated,
    beforeHighlight: toolbar.hide,
  });
  const { busy, setProblem } = saving;
  const [pausedKey, setPausedKey] = useState<string | null>(null);
  const area = useAreaSelectionMode(surface);
  const [switchTo, setSwitchTo] = useState<{
    readonly key: string;
    readonly value: ComposerSelection;
  } | null>(null);
  const selection = pausedKey === key ? null : (draft.value?.selection ?? null);
  const open = (value: ComposerSelection, body = ""): void => {
    buffer.replace({ body, selection: value });
    toolbar.hide();
    setSwitchTo(null);
    setPausedKey(null);
    setProblem(null);
    area.endAreaSelection();
    onSelection();
  };
  useSelectionRouting({
    key,
    ready: draft.ready,
    sourceId,
    surface,
    buffer,
    paused: pausedKey === key,
    busy,
    offerSwitch: (value) => setSwitchTo({ key, value }),
    compose: (value) => open(value),
    highlight: saving.highlight,
    showToolbar: toolbar.showSelection,
  });
  const dismiss = (): void => {
    if (
      busy.current ||
      (buffer.get()?.body.trim() &&
        !confirmAnnotationDiscard("Discard this unfinished annotation comment?"))
    ) {
      return;
    }
    buffer.replace(null);
    surface?.capabilities.textSelection?.clearSelection();
    surface?.capabilities.areaSelection?.cancelAreaSelection();
    setProblem(null);
    setSwitchTo(null);
    area.endAreaSelection();
  };
  const pendingSwitch = switchTo?.key === key && selection ? switchTo : null;
  return {
    selection,
    note: buffer.get()?.body ?? "",
    status: saving.saving ? "saving" : "idle",
    error: saving.problem?.sourceId === sourceId ? saving.problem.message : null,
    canSelectArea: area.canSelectArea,
    selectingArea: area.selectingArea,
    resumeDraft: draft.value && !selection ? () => setPausedKey(null) : null,
    newSelection: pendingSwitch !== null,
    useNewSelection: () => {
      if (pendingSwitch && !busy.current) {
        open(pendingSwitch.value, buffer.get()?.body ?? "");
      }
    },
    pause: () => setPausedKey(key),
    setNote: (body) => {
      if (!busy.current) {
        buffer.edit(body);
      }
    },
    dismiss,
    save: saving.save,
    highlight: saving.highlight,
    comment: (value) => {
      if (
        !buffer.get()?.body.trim() ||
        confirmAnnotationDiscard("Discard the unfinished annotation comment and comment on this?")
      ) {
        open(value);
      }
    },
    toggleAreaSelection: area.toggleAreaSelection,
  };
}
