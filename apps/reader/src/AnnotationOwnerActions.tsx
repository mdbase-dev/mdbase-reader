import { useState, type JSX } from "react";

import { readerErrorMessage } from "./errors.js";

import type { Annotation, SourceSummary } from "@mdbase-reader/core";

function outsideChapter(annotation: Annotation, owner: SourceSummary | undefined): boolean {
  const range = owner?.documents.find(
    (document) =>
      document.fileId === annotation.document?.fileId &&
      document.revision === annotation.document.revision,
  )?.range;
  const page =
    annotation.target?.pdf?.pageIndex ??
    (annotation.target?.position?.kind === "pdf"
      ? annotation.target.position.pageIndex
      : undefined);
  return range?.kind === "pages" && page !== undefined && (page < range.start || page > range.end);
}

export function annotationSourceHref(annotation: Annotation, owner: SourceSummary): string {
  const params = new URLSearchParams({
    collection: annotation.collectionId,
    source: owner.id,
    annotation: annotation.path ?? annotation.id,
  });
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("preview")) {
    params.set("preview", "1");
  }
  return `?${params.toString()}`;
}

/** The annotation's source, when worth naming, and a warning when it lies outside a chapter. */
export function AnnotationSourceLine({
  annotation,
  sources = [],
  showSource = true,
}: {
  readonly annotation: Annotation;
  readonly sources?: readonly SourceSummary[] | undefined;
  readonly showSource?: boolean;
}): JSX.Element | null {
  const owner = sources.find(({ id }) => id === annotation.sourceId);
  const outside = outsideChapter(annotation, owner);
  if (!showSource && !outside) {
    return null;
  }
  return (
    <div
      className="annotation-source-line"
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      {showSource ? (
        <small>
          Source:{" "}
          {owner ? (
            <a href={annotationSourceHref(annotation, owner)}>{owner.title}</a>
          ) : (
            annotation.source
          )}
        </small>
      ) : null}
      {outside ? <small>Outside chapter range — still belongs to this chapter</small> : null}
    </div>
  );
}

export interface AnnotationMoveState {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly move: (target: SourceSummary) => void;
}

/** Reassigns an annotation's source; progress and failures are shown by the caller. */
export function useAnnotationMove(
  annotation: Annotation,
  onMove: ((annotation: Annotation, owner: SourceSummary) => Promise<void>) | undefined,
): AnnotationMoveState {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return {
    busy,
    problem,
    move: (target) => {
      if (!onMove) {
        return;
      }
      setBusy(true);
      setProblem(null);
      void onMove(annotation, target)
        .catch((reason: unknown) =>
          setProblem(
            readerErrorMessage(reason, "The annotation could not be moved. Refresh and try again."),
          ),
        )
        .finally(() => setBusy(false));
    },
  };
}

export function AnnotationMoveSelect({
  annotation,
  sources,
  disabled,
  state,
}: {
  readonly annotation: Annotation;
  readonly sources: readonly SourceSummary[];
  readonly disabled: boolean;
  readonly state: AnnotationMoveState;
}): JSX.Element {
  return (
    <label className="annotation-move-select">
      Move annotation to source
      <select
        aria-label="Move annotation to source"
        value={annotation.sourceId}
        disabled={disabled || state.busy || !annotation.recordRevision || !annotation.path}
        onChange={(event) => {
          const target = sources.find(({ id }) => id === event.target.value);
          if (target) {
            state.move(target);
          }
        }}
      >
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.id === annotation.sourceId ? source.title : `Move to ${source.title}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AnnotationMoveStatus({
  state,
}: {
  readonly state: AnnotationMoveState;
}): JSX.Element | null {
  if (state.busy) {
    return (
      <small className="annotation-move-status" role="status">
        Moving annotation…
      </small>
    );
  }
  return state.problem ? (
    <p className="annotation-card-problem" role="alert">
      {state.problem}
    </p>
  ) : null;
}
