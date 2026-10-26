import { t, t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useRef, type JSX, type Ref } from "react";

import { publicationDateLabel } from "./library-publication-date.js";
import { shortFormatLabel } from "./LibraryCells.js";
import { sourceFormat } from "./mdbase-library-views.js";
import {
  readingLocationLabel,
  readingPassage,
  readingProgressValue,
  readingStatusOf,
} from "./reading-progress.js";
import { sourceCreatorsText, sourcesById } from "./source-creators.js";
import { useSourceThumbnail } from "./use-source-thumbnail.js";

import type { SourceThumbnail, ThumbnailFileReader } from "./source-thumbnail.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";

const continueLimit = 3;

/**
 * Sources worth resuming, most recently opened first. A source only glanced at (queued, with
 * no saved position) has nothing to continue, so it waits in the library instead.
 */
export function continueReadingSources(
  sources: readonly SourceSummary[],
  limit = continueLimit,
): readonly SourceSummary[] {
  return [...sources]
    .filter(
      (source) =>
        source.documents.length > 0 &&
        !["finished", "archived", "abandoned"].includes(readingStatusOf(source)) &&
        (readingStatusOf(source) === "reading" ||
          source.readingStatus === "reading" ||
          source.reading?.position !== undefined ||
          (readingProgressValue(source) ?? 0) > 0),
    )
    .sort((left, right) =>
      (right.reading?.lastOpenedAt ?? "").localeCompare(left.reading?.lastOpenedAt ?? ""),
    )
    .slice(0, limit);
}

export function continueReadingSource(sources: readonly SourceSummary[]): SourceSummary | null {
  return continueReadingSources(sources, 1)[0] ?? null;
}

/**
 * Up to three sources to pick up again, each shown as the object: a first-page render or
 * cover when one can be read cheaply, else a typographic placeholder. `readFile` enables
 * thumbnails; without it every card keeps its placeholder.
 */
export function ContinueReading({
  sources,
  onOpen,
  readFile,
}: {
  readonly sources: readonly SourceSummary[];
  readonly onOpen: (id: SourceId) => void;
  readonly readFile?: ThumbnailFileReader;
}): JSX.Element | null {
  const resumable = continueReadingSources(sources);
  if (resumable.length === 0) {
    return null;
  }
  const library = sourcesById(sources);
  return (
    <section className="continue-reading" aria-labelledby="continue-reading-heading">
      <h2 id="continue-reading-heading">
        <Trans>Continue reading</Trans>
      </h2>
      <ul className="continue-reading-list">
        {resumable.map((source) => (
          <li key={source.id}>
            <ContinueReadingCard
              source={source}
              creators={sourceCreatorsText(source, library)}
              readFile={readFile}
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContinueReadingCard({
  source,
  creators,
  readFile,
  onOpen,
}: {
  readonly source: SourceSummary;
  readonly creators: string;
  readonly readFile: ThumbnailFileReader | undefined;
  readonly onOpen: (id: SourceId) => void;
}): JSX.Element {
  useLocale();
  const thumbnailRef = useRef<HTMLSpanElement>(null);
  const thumbnail = useSourceThumbnail(source, readFile, thumbnailRef);
  const progress = readingProgressValue(source);
  const location = readingLocationLabel(source, thumbnail?.pageCount);
  const passage = readingPassage(source);
  const byline = [creators, publicationDateLabel(source.published)].filter(Boolean).join(" · ");
  return (
    <button
      className="continue-reading-card"
      type="button"
      aria-label={t`Continue reading ${source.title}`}
      title={source.title}
      onClick={() => onOpen(source.id)}
    >
      <SourceThumbnailView ref={thumbnailRef} source={source} thumbnail={thumbnail} />
      <span className="continue-reading-copy">
        <span className="continue-reading-title">{source.title}</span>
        {byline ? <span className="continue-reading-byline">{byline}</span> : null}
        {passage ? <q className="continue-reading-passage">{passage}</q> : null}
        <span className="continue-reading-progress">
          {progress !== null && progress > 0 ? (
            <span className="continue-reading-bar" aria-hidden="true">
              <i style={{ width: `${String(progress)}%` }} />
            </span>
          ) : null}
          <span>{location || translate({ message: "Just started" })}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * The source as an object. A rendered page or cover when one has loaded; otherwise its title
 * set like a title page, with its format underneath.
 */
export function SourceThumbnailView({
  ref,
  source,
  thumbnail,
}: {
  readonly ref?: Ref<HTMLSpanElement>;
  readonly source: SourceSummary;
  readonly thumbnail: SourceThumbnail | null;
}): JSX.Element {
  return (
    <span
      ref={ref}
      className={`source-thumbnail is-${sourceFormat(source)}${thumbnail ? " has-image" : ""}`}
      aria-hidden="true"
    >
      {thumbnail ? (
        <img src={thumbnail.url} alt="" decoding="async" draggable={false} />
      ) : (
        <>
          <span className="source-thumbnail-title">{source.title}</span>
          <span className="source-thumbnail-format">{shortFormatLabel(source)}</span>
        </>
      )}
    </span>
  );
}
