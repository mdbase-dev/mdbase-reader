import { useCallback, useEffect, useState } from "react";

import { annotationRequest, type ComposerSelection } from "./annotation-composer-request.js";
import { readerErrorMessage } from "./errors.js";

import type { Annotation, AnnotationCreationRequest, SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export type { ComposerSelection } from "./annotation-composer-request.js";

export interface AnnotationComposerController {
  readonly selection: ComposerSelection | null;
  readonly note: string;
  readonly status: "idle" | "saving";
  readonly error: string | null;
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  readonly setNote: (note: string) => void;
  readonly dismiss: () => void;
  readonly save: () => void;
  readonly toggleAreaSelection: () => void;
  readonly open: (annotation: Annotation) => void;
}

interface SelectedDraft {
  readonly sourceId: string;
  readonly surface: ReadingSurface;
  readonly value: ComposerSelection;
}

export function useAnnotationComposer(input: {
  readonly source: SourceSummary | null;
  readonly surface: ReadingSurface | null;
  readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
}): AnnotationComposerController {
  const { source, surface, create } = input;
  const [selected, setSelected] = useState<SelectedDraft | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [areaSelectionSurface, setAreaSelectionSurface] = useState<ReadingSurface | null>(null);
  const [problem, setProblem] = useState<{ sourceId: string; message: string } | null>(null);
  const sourceId = source?.id;
  const selection =
    sourceId && selected?.sourceId === sourceId && selected.surface === surface
      ? selected.value
      : null;
  const error = sourceId && problem?.sourceId === sourceId ? problem.message : null;

  useEffect(
    () =>
      subscribeToSelections(
        source,
        surface,
        setSelected,
        setNote,
        setProblem,
        setAreaSelectionSurface,
      ),
    [source, surface],
  );

  const dismiss = useCallback((): void => {
    surface?.capabilities.textSelection?.clearSelection();
    surface?.capabilities.areaSelection?.cancelAreaSelection();
    setSelected(null);
    setNote("");
    setProblem(null);
    setAreaSelectionSurface(null);
  }, [surface]);

  const save = useCallback((): void => {
    if (!selection || !source || !surface || status === "saving") {
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
  }, [create, dismiss, note, selection, source, status, surface]);

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
    (annotation: Annotation): void => openAnnotation(annotation, { source, surface }, setProblem),
    [source, surface],
  );

  return {
    selection,
    note,
    status,
    error,
    canSelectArea: Boolean(surface?.capabilities.areaSelection),
    selectingArea: areaSelectionSurface === surface,
    setNote,
    dismiss,
    save,
    toggleAreaSelection,
    open,
  };
}

function subscribeToSelections(
  source: SourceSummary | null,
  surface: ReadingSurface | null,
  setSelected: (value: SelectedDraft | null) => void,
  setNote: (value: string) => void,
  setProblem: (value: null) => void,
  setAreaSelectionSurface: (value: ReadingSurface | null) => void,
): (() => void) | undefined {
  if (!source || !surface) {
    return undefined;
  }
  const select = (value: ComposerSelection): void => {
    setSelected({ sourceId: source.id, surface, value });
    setNote("");
    setProblem(null);
    setAreaSelectionSurface(null);
  };
  const text = surface.capabilities.textSelection?.selections.subscribe((value) =>
    select({ kind: "text", value }),
  );
  const area = surface.capabilities.areaSelection?.selections.subscribe((value) =>
    select({ kind: "area", value }),
  );
  return () => {
    text?.();
    area?.();
  };
}

async function saveSelection(
  input: {
    readonly source: SourceSummary;
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

function openAnnotation(
  annotation: Annotation,
  input: { readonly source: SourceSummary | null; readonly surface: ReadingSurface | null },
  setProblem: (value: { sourceId: string; message: string }) => void,
): void {
  const surface = input.surface;
  if (!surface) {
    return;
  }
  if (
    annotation.document &&
    (annotation.document.fileId !== surface.document.document.fileId ||
      annotation.document.revision !== surface.document.document.revision)
  ) {
    if (input.source) {
      setProblem({
        sourceId: input.source.id,
        message: "This annotation targets a different document revision and must be re-anchored.",
      });
    }
    return;
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
  }
}
