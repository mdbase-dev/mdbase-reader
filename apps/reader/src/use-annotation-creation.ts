import { useEffect, useRef, useState } from "react";

import {
  confirmAnnotationDiscard,
  saveAnnotationDraftToCollection,
} from "./annotation-draft-actions.js";
import {
  annotationDraftKey,
  annotationDraftSnapshot,
  saveAnnotationDraft,
} from "./annotation-drafts.js";
import { subscribeToSelections } from "./annotation-selection.js";
import { useAnnotationDraft } from "./use-annotation-draft.js";

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
  readonly draftSaved: boolean;
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
  const draft = useAnnotationDraft(key);
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
      const previous = annotationDraftSnapshot(key).value;
      if (
        busy.current ||
        (previous?.body.trim() &&
          !confirmAnnotationDiscard(
            "Discard the unfinished annotation comment and use this selection?",
          ))
      ) {
        return;
      }
      saveAnnotationDraft(key, { body: "", selection: value });
      setPausedKey(null);
      setProblem(null);
      setAreaSurface(null);
      onSelection();
    });
  }, [key, draft.ready, sourceId, surface, onSelection]);
  const dismiss = (): void => {
    if (
      busy.current ||
      (draft.value?.body.trim() &&
        !confirmAnnotationDiscard("Discard this unfinished annotation comment?"))
    ) {
      return;
    }
    saveAnnotationDraft(key, null);
    surface?.capabilities.textSelection?.clearSelection();
    surface?.capabilities.areaSelection?.cancelAreaSelection();
    setProblem(null);
    setAreaSurface(null);
  };
  const save = (): void => {
    if (!draft.value || !source || !surface || busy.current) {
      return;
    }
    busy.current = true;
    setSaving(true);
    setProblem(null);
    void saveAnnotationDraftToCollection(
      key,
      draft.value,
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
    note: draft.value?.body ?? "",
    status: saving ? "saving" : "idle",
    error: (problem?.sourceId === sourceId ? problem.message : null) ?? draft.problem,
    draftSaved: draft.saved,
    canSelectArea: Boolean(surface?.capabilities.areaSelection),
    selectingArea: areaSurface !== null && areaSurface === surface,
    resumeDraft: draft.value && !selection ? () => setPausedKey(null) : null,
    pause: () => setPausedKey(key),
    setNote: (body) => {
      if (draft.value) {
        draft.set({ ...draft.value, body });
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
