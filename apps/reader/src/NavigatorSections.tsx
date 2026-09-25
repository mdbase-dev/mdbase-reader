import { PlusIcon } from "./icons.js";

import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

const recentLimit = 8;

export function NavigatorShortList({
  label,
  sources,
  selectedSourceId,
  onPreviewSource,
  onOpenSource,
  onOpenBeside,
}: {
  readonly label: string;
  readonly sources: readonly SourceSummary[];
  readonly selectedSourceId: SourceId | null;
  readonly onPreviewSource: (id: SourceId) => void;
  readonly onOpenSource: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
}): JSX.Element {
  return (
    <section className="navigator-source-section is-short">
      <header>
        <span>{label}</span>
      </header>
      <ul className="navigator-short-list" aria-label={label}>
        {sources.map((source) => (
          <li key={source.id}>
            <button
              type="button"
              aria-current={source.id === selectedSourceId ? "true" : undefined}
              title="Double-click to keep open · Ctrl+Enter opens beside"
              onClick={() => onPreviewSource(source.id)}
              onDoubleClick={() => onOpenSource(source.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  onOpenBeside(source.id);
                }
              }}
            >
              <span className={`navigator-format is-${sourceFormat(source)}`}>
                {sourceFormat(source)}
              </span>
              <span>
                <strong>{source.title}</strong>
                <small>{sourceDetail(source)}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Most recently opened first; sources marked as reading fill in when history is sparse. */
export function recentSources(
  sources: readonly SourceSummary[],
  open: readonly SourceSummary[],
): readonly SourceSummary[] {
  const openIds = new Set(open.map(({ id }) => id));
  const candidates = sources.filter((source) => !openIds.has(source.id));
  const opened = candidates
    .filter((source) => source.reading?.lastOpenedAt)
    .sort((left, right) =>
      (right.reading?.lastOpenedAt ?? "").localeCompare(left.reading?.lastOpenedAt ?? ""),
    );
  const reading = candidates.filter(
    (source) =>
      !source.reading?.lastOpenedAt &&
      (source.reading?.status ?? source.readingStatus) === "reading",
  );
  return [...opened, ...reading].slice(0, recentLimit);
}

function sourceDetail(source: SourceSummary): string {
  const creators = source.creators.join(", ") || "Unknown creator";
  const progress = source.reading?.progress;
  return progress !== undefined && progress > 0 && progress < 1
    ? `${creators} · ${String(Math.round(progress * 100))}%`
    : creators;
}

export function sourceFormat(source: SourceSummary): string {
  const media = source.documents[0]?.mediaType ?? "";
  if (media.includes("pdf")) {
    return "PDF";
  }
  if (media.includes("epub")) {
    return "EPUB";
  }
  if (media.includes("html")) {
    return "WEB";
  }
  return source.documents[0] ? "FILE" : "—";
}

/** Adding a source; browsing the whole library is the "All sources" view above. */
export function NavigatorFooter({
  addingSource,
  onAddSource,
}: {
  readonly addingSource: boolean;
  readonly onAddSource: () => void;
}): JSX.Element {
  return (
    <footer className="navigator-footer">
      <button
        className="navigator-add-source"
        type="button"
        disabled={addingSource}
        aria-label={addingSource ? "Adding source" : "Add source"}
        onClick={onAddSource}
      >
        <PlusIcon />
        <span>{addingSource ? "Adding…" : "Add source"}</span>
      </button>
    </footer>
  );
}
