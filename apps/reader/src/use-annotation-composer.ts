import { useCallback, useEffect, useState } from "react";

import {
  annotationRequest,
  prepareAnnotationSelection,
  type ComposerSelection,
} from "./annotation-composer-request.js";
import { annotationMatchesSurface } from "./annotation-document-compatibility.js";
import { readerErrorMessage } from "./errors.js";
import { useAnnotationActivations } from "./use-annotation-activations.js";

import type {
  Annotation,
  AnnotationCreationRequest,
  AnnotationId,
  Source,
  SourceId,
} from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export type { ComposerSelection } from "./annotation-composer-request.js";

const SOURCE_DETAILS_LOADING_MESSAGE =
  "Source details are still loading. Try saving again in a moment.";

export interface AnnotationComposerController {
  readonly selection: ComposerSelection | null;
  readonly note: string;
  readonly status: "idle" | "saving";
  readonly error: string | null;
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  readonly canOpenAnnotation: boolean;
  readonly activeAnnotationId: AnnotationId | null;
  readonly editingAnnotationId: AnnotationId | null;
  readonly setNote: (note: string) => void;
  readonly dismiss: () => void;
  readonly save: () => void;
  readonly toggleAreaSelection: () => void;
  readonly open: (annotation: Annotation) => void;
  readonly edit: (annotation: Annotation) => void;
  readonly stopEditing: () => void;
}

export interface SelectedDraft {
  readonly sourceId: SourceId;
  readonly surface: ReadingSurface;
  readonly value: ComposerSelection;
}

export function useAnnotationComposer(input: {
  readonly sourceId: SourceId | null;
  readonly source: Source | null;
  readonly surface: ReadingSurface | null;
  readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
  readonly annotations: readonly Annotation[];
}): AnnotationComposerController {
  const { sourceId, source, surface, create, annotations } = input;
  const [selected, setSelected] = useState<SelectedDraft | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [areaSelectionSurface, setAreaSelectionSurface] = useState<ReadingSurface | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<AnnotationId | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<AnnotationId | null>(null);
  const [problem, setProblem] = useState<{ sourceId: string; message: string } | null>(null);
  const selection =
    sourceId && selected?.sourceId === sourceId && selected.surface === surface
      ? selected.value
      : null;
  const error = sourceId && problem?.sourceId === sourceId ? problem.message : null;
  useEffect(() => {
    return subscribeToSelections(sourceId, surface, (value) => {
      setSelected(value);
      setNote("");
      setProblem(null);
      setAreaSelectionSurface(null);
      setActiveAnnotationId(null);
      setEditingAnnotationId(null);
    });
  }, [sourceId, surface]);
  const dismiss = useCallback((): void => {
    surface?.capabilities.textSelection?.clearSelection();
    surface?.capabilities.areaSelection?.cancelAreaSelection();
    setSelected(null);
    setNote("");
    setProblem(null);
    setAreaSelectionSurface(null);
    setActiveAnnotationId(null);
    setEditingAnnotationId(null);
  }, [surface]);

  const save = useCallback((): void => {
    if (!selection || !sourceId || !surface || status === "saving") {
      return;
    }
    if (source?.id !== sourceId) {
      setProblem({ sourceId, message: SOURCE_DETAILS_LOADING_MESSAGE });
      return;
    }
    setStatus("saving");
    setProblem(null);
    void saveSelection(
      { source, surface, create },
      selection,
      note,
      dismiss,
      setProblem,
      setStatus,
    );
  }, [create, dismiss, note, selection, source, sourceId, status, surface]);

  const toggleAreaSelection = useCallback((): void => {
    const capability = surface?.capabilities.areaSelection;
    if (!capability) {
      return;
    }
    if (areaSelectionSurface === surface) {
      capability.cancelAreaSelection();
      setAreaSelectionSurface(null);
      return;
    }
    surface.capabilities.textSelection?.clearSelection();
    setSelected(null);
    setProblem(null);
    capability.beginAreaSelection();
    setAreaSelectionSurface(surface);
  }, [areaSelectionSurface, surface]);

  const open = useCallback(
    (annotation: Annotation): void => {
      if (openAnnotation(annotation, { source, surface }, setProblem)) {
        setActiveAnnotationId(annotation.id);
      }
    },
    [source, surface],
  );

  const edit = useCallback(
    (annotation: Annotation): void => {
      surface?.capabilities.textSelection?.clearSelection();
      setSelected(null);
      setNote("");
      setProblem(null);
      setEditingAnnotationId(annotation.id);
      setActiveAnnotationId(annotation.id);
      openAnnotation(annotation, { source, surface }, setProblem);
    },
    [source, surface],
  );

  const stopEditing = useCallback((): void => {
    setEditingAnnotationId(null);
    setActiveAnnotationId(null);
  }, []);

  useAnnotationActivations(surface, annotations, edit);

  return {
    selection,
    note,
    status,
    error,
    canSelectArea: Boolean(surface?.capabilities.areaSelection),
    selectingArea: areaSelectionSurface === surface,
    canOpenAnnotation: surface !== null,
    activeAnnotationId,
    editingAnnotationId,
    setNote,
    dismiss,
    save,
    toggleAreaSelection,
    open,
    edit,
    stopEditing,
  };
}

export function subscribeToSelections(
  sourceId: SourceId | null,
  surface: ReadingSurface | null,
  select: (value: SelectedDraft) => void,
): (() => void) | undefined {
  if (!sourceId || !surface) {
    return undefined;
  }
  const selectForSurface = (value: ComposerSelection): void => {
    select({ sourceId, surface, value });
  };
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
  const sourceId = input.source.id;
  try {
    await input.create(await annotationRequest(input.source, input.surface, selection, note));
    dismiss();
  } catch (reason) {
    setProblem({
      sourceId,
      message: readerErrorMessage(reason, "Reader could not save this annotation."),
    });
  } finally {
    setStatus("idle");
  }
}

function openAnnotation(
  annotation: Annotation,
  input: { readonly source: Source | null; readonly surface: ReadingSurface | null },
  setProblem: (value: { sourceId: string; message: string }) => void,
): boolean {
  const surface = input.surface;
  if (!surface) {
    return false;
  }
  if (!annotationMatchesSurface(annotation, surface)) {
    if (input.source) {
      setProblem({
        sourceId: input.source.id,
        message: "This annotation targets a different document and cannot be opened here.",
      });
    }
    return false;
  }
  if (annotation.target?.pdf) {
    void surface.goTo({ kind: "pdf", pageIndex: annotation.target.pdf.pageIndex });
  } else if (annotation.target?.epub) {
    void surface.goTo({
      kind: "epub",
      locator: {
        type: "application/xhtml+xml",
        locations: { fragments: [annotation.target.epub.cfi] },
      },
    });
  } else if (annotation.target?.html) {
    void surface.capabilities.annotationNavigation?.goToAnnotation(annotation);
  } else {
    return false;
  }
  return true;
}
