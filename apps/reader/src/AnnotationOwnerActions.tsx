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

function ownerHref(annotation: Annotation, owner: SourceSummary): string {
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

export function AnnotationOwnerActions({
  annotation,
  sources = [],
  disabled = false,
  onMove,
}: {
  readonly annotation: Annotation;
  readonly sources?: readonly SourceSummary[] | undefined;
  readonly disabled?: boolean;
  readonly onMove?: ((annotation: Annotation, owner: SourceSummary) => Promise<void>) | undefined;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const owner = sources.find(({ id }) => id === annotation.sourceId);
  return (
    <div
      className="annotation-owner-control"
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      <small>
        Owner:{" "}
        {owner ? <a href={ownerHref(annotation, owner)}>{owner.title}</a> : annotation.source}
      </small>
      {outsideChapter(annotation, owner) ? (
        <small>Outside chapter range — still owned by this chapter</small>
      ) : null}
      {onMove && sources.length > 1 ? (
        <label>
          Move annotation
          <select
            aria-label="Move annotation to source"
            value={annotation.sourceId}
            disabled={disabled || busy || !annotation.recordRevision || !annotation.path}
            onChange={(event) => {
              const target = sources.find(({ id }) => id === event.target.value);
              if (!target) {
                return;
              }
              setBusy(true);
              setProblem(null);
              void onMove(annotation, target)
                .catch((reason: unknown) =>
                  setProblem(
                    readerErrorMessage(
                      reason,
                      "The annotation could not be moved. Refresh and try again.",
                    ),
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.id === annotation.sourceId
                  ? source.title
                  : source.partOf
                    ? `Move to ${source.title}`
                    : "Move to the book"}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {busy ? <small role="status">Moving annotation…</small> : null}
      {problem ? <p role="alert">{problem}</p> : null}
    </div>
  );
}
