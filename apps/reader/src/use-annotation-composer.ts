import { useCallback, useEffect, useState } from "react";

import { readerErrorMessage } from "./errors.js";

import type {
  Annotation,
  AnnotationCreationRequest,
  Locator,
  SourceSummary,
} from "@mdbase-reader/core";
import type {
  ReaderLocator,
  ReadingSurface,
  TextSelectionDraft,
} from "@mdbase-reader/reading-surface";

export interface AnnotationComposerController {
  readonly selection: TextSelectionDraft | null;
  readonly note: string;
  readonly status: "idle" | "saving";
  readonly error: string | null;
  readonly setNote: (note: string) => void;
  readonly dismiss: () => void;
  readonly save: () => void;
  readonly open: (annotation: Annotation) => void;
}

interface SelectedDraft {
  readonly sourceId: string;
  readonly surface: ReadingSurface;
  readonly value: TextSelectionDraft;
}

export function useAnnotationComposer(input: {
  readonly source: SourceSummary | null;
  readonly surface: ReadingSurface | null;
  readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
}): AnnotationComposerController {
  const [selected, setSelected] = useState<SelectedDraft | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [problem, setProblem] = useState<{
    readonly sourceId: string;
    readonly message: string;
  } | null>(null);
  const sourceId = input.source?.id;
  const selection =
    sourceId && selected?.sourceId === sourceId && selected.surface === input.surface
      ? selected.value
      : null;
  const error = sourceId && problem?.sourceId === sourceId ? problem.message : null;

  useEffect(() => {
    const capability = input.surface?.capabilities.textSelection;
    return capability?.selections.subscribe((draft) => {
      if (input.source && input.surface) {
        setSelected({ sourceId: input.source.id, surface: input.surface, value: draft });
        setNote("");
        setProblem(null);
      }
    });
  }, [input.source, input.surface]);

  const dismiss = useCallback((): void => {
    input.surface?.capabilities.textSelection?.clearSelection();
    setSelected(null);
    setNote("");
    setProblem(null);
  }, [input.surface]);

  const save = useCallback((): void => {
    if (!selection || !input.source || !input.surface || status === "saving") {
      return;
    }
    setStatus("saving");
    setProblem(null);
    void input
      .create(annotationRequest(input.source, input.surface, selection, note))
      .then(() => dismiss())
      .catch((reason: unknown) =>
        input.source
          ? setProblem({
              sourceId: input.source.id,
              message: readerErrorMessage(reason, "Reader could not save this annotation."),
            })
          : undefined,
      )
      .finally(() => setStatus("idle"));
  }, [dismiss, input, note, selection, status]);

  const open = useCallback(
    (annotation: Annotation): void => {
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
            message:
              "This annotation targets a different document revision and must be re-anchored.",
          });
        }
        return;
      }
      const locator = annotationLocator(annotation);
      if (locator) {
        void surface.goTo(locator);
      }
    },
    [input.source, input.surface],
  );

  return { selection, note, status, error, setNote, dismiss, save, open };
}

function annotationRequest(
  source: SourceSummary,
  surface: ReadingSurface,
  selection: TextSelectionDraft,
  note: string,
): AnnotationCreationRequest {
  return {
    collectionId: source.collectionId,
    sourceId: source.id,
    source: `[[${source.id}]]`,
    document: surface.document.document,
    annotationType: "highlight",
    motivation: note.trim() ? "commenting" : "highlighting",
    color: "yellow",
    locator: locatorLabel(selection.locator),
    target: selection.target,
    tags: [],
    body: annotationBody(selection.target.quote.exact, note),
  };
}

function locatorLabel(locator: ReaderLocator): Locator {
  if (locator.kind === "pdf") {
    return { label: `p. ${String(locator.pageIndex + 1)}` };
  }
  return { label: locator.kind === "epub" ? "EPUB location" : locator.href };
}

function annotationBody(quote: string, note: string): string {
  const quotation = quote
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const commentary = note.trim();
  return commentary ? `${quotation}\n\n${commentary}` : quotation;
}

function annotationLocator(annotation: Annotation): ReaderLocator | null {
  if (annotation.target?.pdf) {
    return { kind: "pdf", pageIndex: annotation.target.pdf.pageIndex };
  }
  return null;
}
