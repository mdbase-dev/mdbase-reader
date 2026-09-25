import { useRef, useState, type RefObject } from "react";

import { saveAnnotationDraftToCollection } from "./annotation-draft-actions.js";
import { saveSelection } from "./annotation-selection.js";

import type { AnnotationCreationBuffer } from "./annotation-creation-buffer.js";
import type { TextComposerSelection } from "./use-selection-toolbar.js";
import type { Annotation, AnnotationCreationRequest, Source } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

type Problem = { readonly sourceId: string; readonly message: string } | null;

/**
 * Saves either a bare highlight straight from a selection or the composer's draft. Only the draft
 * is guarded against double saves; `busy` means the draft is on its way to the collection.
 */
export function useCreationSaving(input: {
  readonly source: Source | null;
  readonly surface: ReadingSurface | null;
  readonly buffer: AnnotationCreationBuffer;
  readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
  readonly onCreated: (annotation: Annotation) => void;
  readonly beforeHighlight: () => void;
}): {
  readonly busy: RefObject<boolean>;
  readonly saving: boolean;
  readonly problem: Problem;
  readonly setProblem: (problem: Problem) => void;
  readonly highlight: (value: TextComposerSelection) => void;
  readonly save: () => void;
} {
  const { source, surface, buffer, create } = input;
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const begin = (): boolean => {
    if (!source || !surface || busy.current) {
      return false;
    }
    busy.current = true;
    setSaving(true);
    setProblem(null);
    return true;
  };
  const finish = (): void => {
    busy.current = false;
    setSaving(false);
  };
  return {
    busy,
    saving,
    problem,
    setProblem,
    highlight: (value) => {
      if (!source || !surface) {
        return;
      }
      // Highlights save independently of the composer's draft and of each other, so the next
      // selection gets its toolbar at once instead of waiting for this save's round trip.
      input.beforeHighlight();
      surface.capabilities.textSelection?.clearSelection();
      setProblem(null);
      void saveSelection(
        {
          source,
          surface,
          create: (request) =>
            create(request).then((created) => {
              input.onCreated(created);
              return created;
            }),
        },
        value,
        "",
        () => undefined,
        setProblem,
        () => undefined,
      );
    },
    save: () => {
      const value = buffer.get();
      if (!value || !source || !surface || !begin()) {
        return;
      }
      void saveAnnotationDraftToCollection(
        () => buffer.clearIf(value),
        value,
        source,
        surface,
        create,
        setProblem,
        finish,
      );
    },
  };
}
