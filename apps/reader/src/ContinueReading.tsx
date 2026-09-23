import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export function continueReadingSource(sources: readonly SourceSummary[]): SourceSummary | null {
  return (
    [...sources]
      .filter(
        (source) =>
          source.documents.length > 0 &&
          !["finished", "archived", "abandoned"].includes(
            source.reading?.status ?? source.readingStatus ?? "",
          ) &&
          (Boolean(source.reading?.lastOpenedAt) ||
            source.readingStatus === "reading" ||
            source.reading?.status === "reading"),
      )
      .sort((left, right) =>
        (right.reading?.lastOpenedAt ?? "").localeCompare(left.reading?.lastOpenedAt ?? ""),
      )[0] ?? null
  );
}

export function readingProgressValue(source: SourceSummary): number | null {
  const reading = source.reading;
  const position = reading?.position;
  const progress =
    reading?.progress ?? (position?.kind === "html" ? position.progression : undefined);
  return progress === undefined ? null : Math.round(Math.max(0, Math.min(1, progress)) * 100);
}

export function readingLocationLabel(source: SourceSummary): string {
  const position = source.reading?.position;
  const progress = readingProgressValue(source);
  const parts = [
    position?.kind === "pdf" ? `Page ${String(position.pageIndex + 1)}` : null,
    progress === null ? null : `${String(progress)}%`,
  ].filter((part): part is string => part !== null);
  return parts.join(" · ");
}

export function ContinueReading({
  sources,
  onOpen,
}: {
  readonly sources: readonly SourceSummary[];
  readonly onOpen: (id: SourceId) => void;
}): JSX.Element | null {
  const source = continueReadingSource(sources);
  if (!source) {
    return null;
  }
  const progress = readingProgressValue(source);
  const location = readingLocationLabel(source);
  const creators = source.creators.join(", ");
  return (
    <button
      className="continue-reading"
      type="button"
      aria-label={`Continue reading ${source.title}`}
      onClick={() => onOpen(source.id)}
    >
      <span className="continue-reading-label">Continue reading</span>
      <span className="continue-reading-title">
        <strong>{source.title}</strong>
        {creators || location ? (
          <small>{[creators, location].filter(Boolean).join(" · ")}</small>
        ) : null}
      </span>
      {progress !== null ? (
        <span className="library-progress" aria-hidden="true">
          <i style={{ width: `${String(progress)}%` }} />
        </span>
      ) : null}
      <span className="continue-reading-action" aria-hidden="true">
        Resume →
      </span>
    </button>
  );
}
