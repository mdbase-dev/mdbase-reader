import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { annotationCreationBuffer } from "./annotation-creation-buffer.js";
import {
  confirmAnnotationDiscard,
  saveAnnotationDraftToCollection,
} from "./annotation-draft-actions.js";
import { annotationDraftKey } from "./annotation-drafts.js";
import { subscribeToSelections } from "./annotation-selection.js";

import type { ComposerSelection } from "./annotation-composer-request.js";
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
  readonly pause: () => void;
  readonly setNote: (note: string) => void;
  readonly dismiss: () => void;
  readonly save: () => void;
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
): AnnotationCreationController {
  const { sourceId, source, surface, create } = input;
  const key = creationKey(source, surface);
  const buffer = annotationCreationBuffer(
    key,
    source ? { collectionId: source.collectionId, sourceId: source.id } : undefined,
  );
  const draft = useSyncExternalStore(buffer.subscribe, buffer.getSnapshot, buffer.getSnapshot);
  useEffect(() => buffer.start(), [buffer]);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [pausedKey, setPausedKey] = useState<string | null>(null);
  const [areaSurface, setAreaSurface] = useState<ReadingSurface | null>(null);
  const [problem, setProblem] = useState<{ sourceId: string; message: string } | null>(null);
  const selection = pausedKey === key ? null : (draft.value?.selection ?? null);
  useEffect(() => {
    if (!key || !draft.ready) {
      return undefined;
    }
    return subscribeToSelections(sourceId, surface, ({ value }) => {
      const previous = buffer.get();
      if (
        busy.current ||
        (previous?.body.trim() &&
          !confirmAnnotationDiscard(
            "Discard the unfinished annotation comment and use this selection?",
          ))
      ) {
        return;
      }
      buffer.replace({ body: "", selection: value });
      setPausedKey(null);
      setProblem(null);
      setAreaSurface(null);
      onSelection();
    });
  }, [key, draft.ready, sourceId, surface, onSelection, buffer]);
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
    setAreaSurface(null);
  };
  const save = (): void => {
    const value = buffer.get();
    if (!value || !source || !surface || busy.current) {
      return;
    }
    busy.current = true;
    setSaving(true);
    setProblem(null);
    void saveAnnotationDraftToCollection(
      () => buffer.clearIf(value),
      value,
      source,
      surface,
      create,
      setProblem,
      () => {
        busy.current = false;
        setSaving(false);
      },
    );
  };
  return {
    selection,
    note: buffer.get()?.body ?? "",
    status: saving ? "saving" : "idle",
    error: problem?.sourceId === sourceId ? problem.message : null,
    canSelectArea: Boolean(surface?.capabilities.areaSelection),
    selectingArea: areaSurface !== null && areaSurface === surface,
    resumeDraft: draft.value && !selection ? () => setPausedKey(null) : null,
    pause: () => setPausedKey(key),
    setNote: (body) => {
      if (!busy.current) {
        buffer.edit(body);
      }
    },
    dismiss,
    save,
    toggleAreaSelection: () => {
      const capability = surface?.capabilities.areaSelection;
      if (!capability) {
        return;
      }
      if (areaSurface === surface) {
        capability.cancelAreaSelection();
        setAreaSurface(null);
      } else {
        capability.beginAreaSelection();
        setAreaSurface(surface);
      }
    },
  };
}
