import { i18n } from "@lingui/core";
import { t, plural, t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { useLingui } from "@lingui/react/macro";
import { Select, type SelectOption } from "@mdbase-dev/ui/select";
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
import { readingProgressValue, readingStatusOf } from "./reading-progress.js";

import type {
  ReadingStatus as ReadingStatusValue,
  SourceId,
  SourceSummary,
} from "@mdbase-reader/core";
import type { JSX } from "react";

const empty = <span className="library-empty-value">—</span>;

type CellRenderer = (source: SourceSummary, annotations: number) => JSX.Element;

/**
 * The title leads; people, format and, for a part, its book follow on one quieter line. A
 * creator or format column hides its part of that line (library.css) rather than repeat it.
 */
function TitleCell({
  source,
  context,
}: {
  readonly source: SourceSummary;
  readonly context?: string | undefined;
}): JSX.Element {
  return (
    <span className="library-title-copy">
      <strong title={source.title}>{source.title}</strong>
      <small>
        {source.creators.length ? (
          <span className="library-title-creators">{source.creators.join(", ")}</span>
        ) : null}
        <span className={`library-title-format is-${sourceFormat(source)}`}>
          {formatLabel(source)}
        </span>
        {context ? <span className="library-title-context">{context}</span> : null}
      </small>
    </span>
  );
}

const builtinCells: Record<BuiltinLibraryColumn, CellRenderer> = {
  title: (source) => <TitleCell source={source} />,
  creator: (source) => <>{source.creators.join(", ") || "—"}</>,
  published: (source) => <>{publicationDateLabel(source.published) ?? "—"}</>,
  status: (source) => <ReadingStatus source={source} />,
  format: (source) => <>{formatLabel(source)}</>,
  tags: (source) => <>{source.tags.map(String).join(", ") || "—"}</>,
  annotations: (_source, annotations) =>
    annotations > 0 ? (
      <span className="library-count" title={countLabel(annotations, "annotation")}>
        {annotations.toLocaleString(i18n.locale)}
      </span>
    ) : (
      empty
    ),
  opened: (source) => {
    const opened = source.reading?.lastOpenedAt;
    return opened ? (
      <time dateTime={opened} title={new Date(opened).toLocaleString(i18n.locale)}>
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
  context,
}: {
  readonly source: SourceSummary;
  readonly column: LibraryColumn;
  readonly context?: string | undefined;
  readonly annotations: number;
  /** Values a saved view selected for this source, keyed by field. */
  readonly selected?: Readonly<Record<string, unknown>> | undefined;
}): JSX.Element {
  const key = propertyKey(column);
  if (key === null) {
    return column === "title" ? (
      <TitleCell source={source} context={context} />
    ) : (
      builtinCells[column as BuiltinLibraryColumn](source, annotations)
    );
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
    return translate`Today`;
  }
  if (days === 1) {
    return translate`Yesterday`;
  }
  if (days < 7) {
    return new Intl.RelativeTimeFormat(i18n.locale, { numeric: "auto" }).format(-days, "day");
  }
  return date.toLocaleDateString(i18n.locale, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** A status reads as a coloured word, with progress as a number beside it: "Reading 42%". */
export function ReadingStatus({ source }: { readonly source: SourceSummary }): JSX.Element {
  useLocale();
  const progress = readingProgress(source);
  return (
    <span className={`library-status is-${readingStatusOf(source)}`}>
      <i className="library-status-mark" aria-hidden="true" />
      <span className="library-status-word">{statusLabel(source)}</span>
      {progress !== null ? <ProgressNumber progress={progress} /> : null}
    </span>
  );
}

function ProgressNumber({ progress }: { readonly progress: number }): JSX.Element {
  useLocale();
  return (
    <span className="library-status-progress" title={t`${String(progress)}% read`}>
      {progress}%
    </span>
  );
}

export const readingStatusChoices: readonly ReadingStatusValue[] = readingStatuses;

export function readingStatusLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    inbox: translate({ message: "Inbox", context: "reading status" }),
    queued: translate({ message: "Queued", context: "reading status" }),
    reading: translate({ message: "Reading", context: "reading status" }),
    finished: translate({ message: "Finished", context: "reading status" }),
    archived: translate({ message: "Archived", context: "reading status" }),
    abandoned: translate({ message: "Abandoned", context: "reading status" }),
  };
  return labels[status] ?? status;
}

export function readingStatusOptions(): readonly SelectOption<ReadingStatusValue>[] {
  return readingStatusChoices.map((status) => ({
    value: status,
    label: readingStatusLabel(status),
  }));
}

export function StatusPicker({
  source,
  onChange,
}: {
  readonly source: SourceSummary;
  readonly onChange: (id: SourceId, status: ReadingStatusValue) => void;
}): JSX.Element {
  const { t } = useLingui();
  const progress = readingProgress(source);
  const status = readingStatusOf(source);
  return (
    <span className={`library-status is-${status} is-editable`}>
      <i className="library-status-mark" aria-hidden="true" />
      <Select
        aria-label={t`Reading status of ${source.title}`}
        className="is-quiet"
        value={status}
        options={readingStatusOptions()}
        // The row owns clicks, double-clicks and grid keys; the picker keeps its own.
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(next) => onChange(source.id, next)}
      />
      {progress !== null ? <ProgressNumber progress={progress} /> : null}
    </span>
  );
}

function statusLabel(source: SourceSummary): string {
  return readingStatusLabel(readingStatusOf(source));
}

/** Progress shows only while reading; a finished or queued source's old figure would mislead. */
function readingProgress(source: SourceSummary): number | null {
  return readingStatusOf(source) === "reading" ? readingProgressValue(source) : null;
}

/** The source's format as a word, as the format filter names it. */
export function formatLabel(source: SourceSummary): string {
  const format = sourceFormat(source);
  return format === "web"
    ? translate({ message: "Web page" })
    : format === "note"
      ? translate({ message: "No file attached" })
      : format === "file"
        ? "File"
        : format.toLocaleUpperCase();
}

/** The format short enough for a card's bookplate or a thumbnail; a dash when there is no file. */
export function shortFormatLabel(source: SourceSummary): string {
  const format = sourceFormat(source);
  return format === "web"
    ? translate({ message: "Web", context: "source format" })
    : format === "note"
      ? "—"
      : format === "file"
        ? "File"
        : format.toLocaleUpperCase();
}

export function countLabel(count: number, noun: "source" | "annotation"): string {
  return noun === "annotation"
    ? plural(count, { one: "# annotation", other: "# annotations" })
    : plural(count, { one: "# source", other: "# sources" });
}
