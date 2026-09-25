import { readingStatuses } from "@mdbase-reader/core";

import {
  formatPropertyValue,
  propertyKey,
  propertyValue,
  type BuiltinLibraryColumn,
  type LibraryColumn,
} from "./library-columns.js";
import { publicationDateLabel } from "./library-publication-date.js";
import { sourceFormat } from "./mdbase-library-views.js";

import type {
  ReadingStatus as ReadingStatusValue,
  SourceId,
  SourceSummary,
} from "@mdbase-reader/core";
import type { JSX } from "react";

const empty = <span className="library-empty-value">—</span>;

type CellRenderer = (source: SourceSummary, annotations: number) => JSX.Element;

const builtinCells: Record<BuiltinLibraryColumn, CellRenderer> = {
  title: (source) => (
    <>
      <span className={`source-format-tag is-${sourceFormat(source)}`}>{formatLabel(source)}</span>
      <span className="library-title-copy">
        <strong>{source.title}</strong>
        <small>{source.creators.join(", ") || "Unknown creator"}</small>
      </span>
    </>
  ),
  creator: (source) => <>{source.creators.join(", ") || "—"}</>,
  published: (source) => <>{publicationDateLabel(source.published) ?? "—"}</>,
  status: (source) => <ReadingStatus source={source} />,
  format: (source) => <>{formatLabel(source)}</>,
  tags: (source) => <>{source.tags.map(String).join(", ") || "—"}</>,
  annotations: (_source, annotations) =>
    annotations > 0 ? (
      <span className="library-count" title={countLabel(annotations, "annotation")}>
        {annotations.toLocaleString()}
      </span>
    ) : (
      empty
    ),
  opened: (source) => {
    const opened = source.reading?.lastOpenedAt;
    return opened ? (
      <time dateTime={opened} title={new Date(opened).toLocaleString()}>
        {relativeDay(opened)}
      </time>
    ) : (
      empty
    );
  },
};

export function TableValue({
  source,
  column,
  annotations,
  selected,
}: {
  readonly source: SourceSummary;
  readonly column: LibraryColumn;
  readonly annotations: number;
  /** Values a saved view selected for this source, keyed by field. */
  readonly selected?: Readonly<Record<string, unknown>> | undefined;
}): JSX.Element {
  const key = propertyKey(column);
  if (key === null) {
    return builtinCells[column as BuiltinLibraryColumn](source, annotations);
  }
  const text = formatPropertyValue(propertyValue(source, key, selected));
  return text ? (
    <span className="library-property-value" title={text}>
      {text}
    </span>
  ) : (
    empty
  );
}

/** "Today", "Yesterday", "3 days ago", then a short date. */
export function relativeDay(value: string, now = new Date()): string {
  const date = new Date(value);
  const startOf = (day: Date): number =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return `${String(days)} days ago`;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function ReadingStatus({ source }: { readonly source: SourceSummary }): JSX.Element {
  const progress = readingProgress(source);
  return (
    <span className={`library-status is-${readingStatusOf(source)}`}>
      <i className="library-status-mark" aria-hidden="true" />
      <span>{statusLabel(source)}</span>
      {progress !== null ? (
        <span className="library-progress" aria-label={`${String(progress)}% read`}>
          <i style={{ width: `${String(progress)}%` }} />
        </span>
      ) : null}
    </span>
  );
}

export const readingStatusChoices: readonly ReadingStatusValue[] = readingStatuses;

export function readingStatusLabel(status: string): string {
  return status.charAt(0).toLocaleUpperCase() + status.slice(1);
}

export function StatusPicker({
  source,
  onChange,
}: {
  readonly source: SourceSummary;
  readonly onChange: (id: SourceId, status: ReadingStatusValue) => void;
}): JSX.Element {
  const progress = readingProgress(source);
  const status = readingStatusOf(source);
  return (
    <span className={`library-status is-${status} is-editable`}>
      <i className="library-status-mark" aria-hidden="true" />
      <select
        aria-label={`Reading status of ${source.title}`}
        value={status}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(source.id, event.target.value as ReadingStatusValue)}
      >
        {readingStatusChoices.map((choice) => (
          <option key={choice} value={choice}>
            {readingStatusLabel(choice)}
          </option>
        ))}
      </select>
      {progress !== null ? (
        <span className="library-progress" aria-label={`${String(progress)}% read`}>
          <i style={{ width: `${String(progress)}%` }} />
        </span>
      ) : null}
    </span>
  );
}

function readingStatusOf(source: SourceSummary): string {
  return source.reading?.status ?? source.readingStatus ?? "inbox";
}

function statusLabel(source: SourceSummary): string {
  return readingStatusLabel(readingStatusOf(source));
}

function readingProgress(source: SourceSummary): number | null {
  const progress = source.reading?.progress;
  if (progress === undefined || readingStatusOf(source) !== "reading") {
    return null;
  }
  return Math.round(Math.max(0, Math.min(1, progress)) * 100);
}

export function formatLabel(source: SourceSummary): string {
  const format = sourceFormat(source);
  return format === "web" ? "Web" : format === "note" ? "Note" : format.toLocaleUpperCase();
}

export function countLabel(count: number, noun: string): string {
  return `${count.toLocaleString()} ${count === 1 ? noun : `${noun}s`}`;
}
