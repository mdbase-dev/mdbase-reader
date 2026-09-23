import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

const continueLimit = 3;

/** Sources worth resuming, most recently opened first. */
export function continueReadingSources(
  sources: readonly SourceSummary[],
  limit = continueLimit,
): readonly SourceSummary[] {
  return [...sources]
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
    )
    .slice(0, limit);
}

export function continueReadingSource(sources: readonly SourceSummary[]): SourceSummary | null {
  return continueReadingSources(sources, 1)[0] ?? null;
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
  const resumable = continueReadingSources(sources);
  if (resumable.length === 0) {
    return null;
  }
  return (
    <section className="continue-reading" aria-labelledby="continue-reading-heading">
      <h2 id="continue-reading-heading">Continue reading</h2>
      <div className="continue-reading-list">
        {resumable.map((source) => (
          <ContinueReadingRow key={source.id} source={source} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function ContinueReadingRow({
  source,
  onOpen,
}: {
  readonly source: SourceSummary;
  readonly onOpen: (id: SourceId) => void;
}): JSX.Element {
  const progress = readingProgressValue(source);
  const location = readingLocationLabel(source);
  const creators = source.creators.join(", ");
  return (
    <button
      className="continue-reading-item"
      type="button"
      aria-label={`Continue reading ${source.title}`}
      onClick={() => onOpen(source.id)}
    >
      <span className="continue-reading-title">
        <strong>{source.title}</strong>
        {creators || location ? (
          <small>{[creators, location].filter(Boolean).join(" · ")}</small>
        ) : null}
      </span>
      {progress !== null && progress > 0 ? (
        <span className="library-progress" aria-hidden="true">
          <i style={{ width: `${String(progress)}%` }} />
        </span>
      ) : (
        <span className="continue-reading-state">{location || "Not started"}</span>
      )}
    </button>
  );
}
