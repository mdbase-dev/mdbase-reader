import {
  annotationRequest,
  prepareAnnotationSelection,
  type ComposerSelection,
} from "./annotation-composer-request.js";
import { readerErrorMessage } from "./errors.js";

import type { Annotation, AnnotationCreationRequest, Source, SourceId } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";
export interface SelectedDraft {
  readonly sourceId: SourceId;
  readonly surface: ReadingSurface;
  readonly value: ComposerSelection;
}
export function subscribeToSelections(
  sourceId: SourceId | null,
  surface: ReadingSurface | null,
  select: (value: SelectedDraft) => void,
): (() => void) | undefined {
  if (!sourceId || !surface) {
    return undefined;
  }
  const selectForSurface = (value: ComposerSelection): void => select({ sourceId, surface, value });
  const text = surface.capabilities.textSelection?.selections.subscribe((value) =>
    selectForSurface({ kind: "text", value }),
  );
  const area = surface.capabilities.areaSelection?.selections.subscribe((value) => {
    const selection = { kind: "area", value } as const;
    prepareAnnotationSelection(selection);
    selectForSurface(selection);
  });
  return () => {
    text?.();
    area?.();
  };
}
export async function saveSelection(
  input: {
    readonly source: Source;
    readonly surface: ReadingSurface;
    readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
  },
  selection: ComposerSelection,
  note: string,
  dismiss: () => void,
  setProblem: (value: { sourceId: string; message: string }) => void,
  setStatus: (value: "idle" | "saving") => void,
): Promise<void> {
  try {
    await input.create(await annotationRequest(input.source, input.surface, selection, note));
    dismiss();
  } catch (reason) {
    setProblem({
      sourceId: input.source.id,
      message: readerErrorMessage(reason, "Reader could not save this annotation."),
    });
  } finally {
    setStatus("idle");
  }
}
