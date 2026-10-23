import { useEffect, useState } from "react";

import { beginExplicitReadingNavigation } from "./reading-navigation-priority.js";
import { resolveSourceReadingRange, sourceReadingContextKey } from "./source-reading-range.js";

import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type {
  ReadingRangeLocation,
  ReadingRangeResolution,
  ReadingSurface,
} from "@mdbase-reader/reading-surface";
import type { JSX, MouseEvent } from "react";

interface BoundaryProps {
  readonly source: SourceSummary;
  readonly sources: readonly SourceSummary[];
  readonly surface: ReadingSurface | null;
  readonly open: (id: SourceId) => void;
}
interface ResolvedBoundary {
  readonly surface: ReadingSurface;
  readonly key: string;
  readonly range: ReadingRangeResolution;
  readonly location: ReadingRangeLocation | null;
}

export function SourceReadingBoundary(props: BoundaryProps): JSX.Element | null {
  const { source, surface } = props;
  const [state, setState] = useState<ResolvedBoundary | null>(null);
  const key = sourceReadingContextKey(source);
  useEffect(() => {
    if (!surface) {
      return;
    }
    let active = true;
    let stop: (() => void) | undefined;
    void resolveSourceReadingRange(source, surface).then((range) => {
      if (!active || !range) {
        return;
      }
      const update = (): void => {
        const locator = surface.currentLocation();
        setState({
          surface,
          key,
          range,
          location: range.valid && locator ? range.measure(locator) : null,
        });
      };
      update();
      stop = surface.locations.subscribe(update);
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [key, source, surface]);
  return state?.surface === surface && state.key === key ? (
    <ReadingRangeNotice key={key} {...props} state={state} />
  ) : null;
}

function ReadingRangeNotice({
  source,
  sources,
  state,
  open,
}: BoundaryProps & {
  readonly state: ResolvedBoundary;
}): JSX.Element {
  const [wholeFile, setWholeFile] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { range, location, surface } = state;
  const parent = sources.find((item) => item.id === source.partOf);
  const next = nextKnownPart(source, sources, surface);
  const navigate = (): void => {
    if (!range.valid) {
      return;
    }
    setProblem(null);
    const failed = (): void =>
      setProblem("The chapter start could not be opened. You can still read the whole file.");
    void beginExplicitReadingNavigation(surface)
      .then(() => surface.goTo(range.start))
      .then((opened) => {
        if (!opened) {
          failed();
        }
      })
      .catch(failed);
  };
  const bookLabel = parent ? `Continue in the book: ${parent.title}` : "Continue in the book";
  return (
    <aside className="source-reading-boundary" aria-label="Chapter reading range">
      <span role="status" aria-live="polite" aria-atomic="true">
        {problem ?? boundaryText(source.title, range, location, wholeFile)}
      </span>
      {range.valid ? (
        <span aria-label="Chapter progress">
          {location?.progress !== undefined
            ? `${String(Math.round(location.progress * 100))}% of chapter`
            : readingRangeLabel(source, surface)}
        </span>
      ) : null}
      {range.valid ? (
        <button type="button" onClick={navigate}>
          Start chapter
        </button>
      ) : (
        <button type="button" onClick={() => setWholeFile(true)}>
          Read the whole file
        </button>
      )}
      {source.partOf ? (
        <SourceReadingLink source={source} id={source.partOf} open={open} label={bookLabel} />
      ) : null}
      {next && location?.atEnd ? (
        <SourceReadingLink
          source={source}
          id={next.id}
          open={open}
          label={`Next part: ${next.title}`}
        />
      ) : null}
    </aside>
  );
}

function boundaryText(
  title: string,
  range: ReadingRangeResolution,
  location: ReadingRangeLocation | null,
  wholeFile: boolean,
): string {
  if (!range.valid) {
    return wholeFile ? `Reading the whole file. ${range.message}` : range.message;
  }
  if (location?.position === "before") {
    return `Outside chapter — before “${title}”`;
  }
  if (location?.position === "after") {
    return `End of “${title}” — outside chapter`;
  }
  return location?.atEnd ? `End of “${title}”` : `Reading “${title}”`;
}

function readingRangeLabel(source: SourceSummary, surface: ReadingSurface): string | undefined {
  const range = source.documents.find(
    (entry) => entry.fileId === surface.document.document.fileId,
  )?.range;
  switch (range?.kind) {
    case "pages":
      return `File page indexes ${String(range.start)}–${String(range.end)}`;
    case "epub-spine":
      return `Spine: ${range.start} – ${range.end}`;
    case "fragment":
      return range.end
        ? `Fragments: ${range.start} to before ${range.end}`
        : `Section: ${range.start}`;
    default:
      return undefined;
  }
}

function nextKnownPart(
  source: SourceSummary,
  sources: readonly SourceSummary[],
  surface: ReadingSurface,
): SourceSummary | undefined {
  const entry = source.documents.find((item) => item.fileId === surface.document.document.fileId);
  const bounds = entry?.range;
  if (!entry || bounds?.kind !== "pages" || !source.partOf) {
    return undefined;
  }
  return sources
    .filter((item) => item.partOf === source.partOf && item.id !== source.id)
    .flatMap((item) =>
      item.documents.flatMap((document) =>
        document.fileId === entry.fileId &&
        document.revision === entry.revision &&
        document.range?.kind === "pages" &&
        document.range.start > bounds.end
          ? [{ source: item, start: document.range.start }]
          : [],
      ),
    )
    .sort((a, b) => a.start - b.start)[0]?.source;
}

function SourceReadingLink({
  source,
  id,
  label,
  open,
}: {
  readonly source: SourceSummary;
  readonly id: SourceId;
  readonly label: string;
  readonly open: (id: SourceId) => void;
}): JSX.Element {
  return (
    <a
      href={`?collection=${encodeURIComponent(source.collectionId)}&source=${encodeURIComponent(id)}`}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        open(id);
      }}
    >
      {label}
    </a>
  );
}
