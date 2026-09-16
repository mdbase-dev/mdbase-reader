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

export function readingLocationLabel(source: SourceSummary): string {
  const reading = source.reading;
  const position = reading?.position;
  const location =
    position?.kind === "pdf" ? `Page ${String(position.pageIndex + 1)}` : "Resume reading";
  const progress =
    reading?.progress ?? (position?.kind === "html" ? position.progression : undefined);
  return progress === undefined
    ? location
    : `${location} · ${String(Math.round(Math.max(0, Math.min(1, progress)) * 100))}%`;
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
  return (
    <section className="continue-reading" aria-label="Continue reading">
      <div>
        <span>Continue reading</span>
        <strong>{source.title}</strong>
        <small>
          {source.creators.join(", ")} · {readingLocationLabel(source)}
        </small>
      </div>
      <button type="button" onClick={() => onOpen(source.id)}>
        Continue reading <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
