import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  chapterHintKind,
  chapterHintText,
  chapterHintVisible,
  chapterProgressLabel,
  nextChapterHintDismissal,
  type ChapterHintKind,
} from "./chapter-reading-hint.js";
import { CloseIcon } from "./icons.js";
import { Menu } from "./Menu.js";
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
  readonly surface: ReadingSurface | null | undefined;
  readonly open: (id: SourceId) => void;
}
interface ResolvedBoundary {
  readonly surface: ReadingSurface;
  readonly key: string;
  readonly range: ReadingRangeResolution;
  readonly location: ReadingRangeLocation | null;
  /** The reader has been inside the range since the chapter opened in this surface. */
  readonly entered: boolean;
}

// Survives the source record refreshing after each position save, which re-resolves the range.
const enteredChapters = new WeakMap<ReadingSurface, string>();

/** The chapter range and the reader's place in it, or null for a whole document. */
function useSourceReadingBoundary(
  source: SourceSummary,
  surface: ReadingSurface | null | undefined,
): ResolvedBoundary | null {
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
        const location = range.valid && locator ? range.measure(locator) : null;
        if (location?.position === "inside") {
          enteredChapters.set(surface, key);
        }
        const entered = enteredChapters.get(surface) === key;
        setState({ surface, key, range, location, entered });
      };
      update();
      stop = surface.locations.subscribe(update);
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [key, source, surface]);
  if (!state || state.surface !== surface || state.key !== key) {
    return null;
  }
  return state;
}

// The chip and the hint live in different parts of the pane but report one navigation problem.
const problems = new WeakMap<ReadingSurface, string>();
const problemListeners = new Set<() => void>();
function setChapterProblem(surface: ReadingSurface, problem: string | null): void {
  if ((problems.get(surface) ?? null) === problem) {
    return;
  }
  if (problem) {
    problems.set(surface, problem);
  } else {
    problems.delete(surface);
  }
  problemListeners.forEach((listener) => listener());
}
function subscribeProblems(listener: () => void): () => void {
  problemListeners.add(listener);
  return () => problemListeners.delete(listener);
}
function useChapterProblem(surface: ReadingSurface | null | undefined): string | null {
  return useSyncExternalStore(
    subscribeProblems,
    () => (surface ? (problems.get(surface) ?? null) : null),
    () => null,
  );
}

function goToChapterStart(state: ResolvedBoundary): Promise<boolean> {
  const { surface, range } = state;
  if (!range.valid) {
    return Promise.resolve(false);
  }
  setChapterProblem(surface, null);
  const failed = (): false => {
    setChapterProblem(
      surface,
      translate({
        message: "The chapter start could not be opened. You can still read the whole file.",
      }),
    );
    return false;
  };
  return beginExplicitReadingNavigation(surface)
    .then(() => surface.goTo(range.start))
    .then((opened) => opened || failed())
    .catch(failed);
}

/**
 * The chapter's place in its pane's document actions: its name and progress, with a small menu to
 * return to the chapter start or continue in the book. It adds no row of its own.
 */
export function ChapterReadingChip({
  compact = false,
  ...props
}: BoundaryProps & { readonly compact?: boolean }): JSX.Element | null {
  useLocale();
  const { source, sources, surface, open } = props;
  const state = useSourceReadingBoundary(source, surface);
  if (!state) {
    return null;
  }
  const { range, location } = state;
  const progress = chapterProgressLabel(range, location);
  const parent = sources.find((item) => item.id === source.partOf);
  const next = nextKnownPart(source, sources, state.surface);
  const pages = readingRangeLabel(source, state.surface);
  const label = translate`Chapter: ${source.title}${progress ? `, ${progressPhrase(progress)}` : ""}`;
  return (
    <Menu
      className="chapter-reading-chip"
      triggerClassName="chapter-reading-chip-trigger"
      label={label}
      title={label}
      align="end"
      trigger={
        <>
          <span className="chapter-reading-chip-title">
            <Trans>Ch.</Trans>
            {compact ? null : ` ${source.title}`}
          </span>
          {progress ? <span className="chapter-reading-chip-progress">· {progress}</span> : null}
        </>
      }
    >
      <span className="menu-label">{source.title}</span>
      {pages ? <p className="menu-note">{pages}</p> : null}
      {range.valid ? (
        <button type="button" onClick={() => void goToChapterStart(state)}>
          <Trans>Go to chapter start</Trans>
        </button>
      ) : (
        <p className="menu-note">{range.message}</p>
      )}
      {source.partOf ? (
        <SourceReadingLink
          source={source}
          id={source.partOf}
          open={open}
          label={
            parent
              ? translate`Continue in the book: ${parent.title}`
              : translate({ message: "Continue in the book" })
          }
        />
      ) : null}
      {next ? (
        <SourceReadingLink
          source={source}
          id={next.id}
          open={open}
          label={translate`Next part: ${next.title}`}
        />
      ) : null}
    </Menu>
  );
}

function progressPhrase(progress: string): string {
  if (progress === "Outside") {
    return translate({ message: "outside the chapter’s pages" });
  }
  return progress.endsWith("%") ? translate`${progress} read` : progress.toLowerCase();
}

/**
 * A single slim, dismissible line in the document's notice stack, shown only when the reader has
 * left the chapter's pages or the chapter cannot be used as a range. A polite status announces
 * it; both are direct children of the stack, which hides all but live regions while a selection
 * toolbar is docked at the foot.
 */
export function SourceReadingBoundary(props: BoundaryProps): JSX.Element | null {
  const state = useSourceReadingBoundary(props.source, props.surface);
  const problem = useChapterProblem(props.surface);
  return state ? (
    <ChapterReadingHint key={state.key} {...props} state={state} problem={problem} />
  ) : null;
}

// A dismissal outlives the hint, which unmounts while its tab is hidden, until the reader returns
// to the chapter.
const dismissals = new WeakMap<
  ReadingSurface,
  { readonly key: string; readonly kind: ChapterHintKind }
>();

function useChapterDismissal(
  surface: ReadingSurface,
  key: string,
  kind: ChapterHintKind | null,
): [ChapterHintKind | null, (kind: ChapterHintKind | null) => void] {
  const [dismissed, setDismissed] = useState<ChapterHintKind | null>(() => {
    const kept = dismissals.get(surface);
    return kept?.key === key ? kept.kind : null;
  });
  const settled = nextChapterHintDismissal(dismissed, kind);
  if (settled !== dismissed) {
    setDismissed(settled);
  }
  useEffect(() => {
    if (settled) {
      dismissals.set(surface, { key, kind: settled });
    } else {
      dismissals.delete(surface);
    }
  }, [key, settled, surface]);
  return [settled, setDismissed];
}

function ChapterReadingHint({
  source,
  sources,
  state,
  problem,
  open,
}: BoundaryProps & {
  readonly state: ResolvedBoundary;
  readonly problem: string | null;
}): JSX.Element {
  useLocale();
  const { range, location, entered, surface } = state;
  const kind = chapterHintKind({ range, location, entered, problem });
  const [dismissed, setDismissed] = useChapterDismissal(surface, state.key, kind);
  const hint = useRef<HTMLDivElement>(null);
  const announcer = useRef<HTMLSpanElement>(null);
  const visible = chapterHintVisible(kind, dismissed);
  // Hiding the hint must not strand keyboard focus on a removed control.
  const keepFocus = useRef(false);
  useEffect(() => {
    if (!visible && keepFocus.current) {
      keepFocus.current = false;
      const canvas = announcer.current?.closest(".document-canvas");
      canvas?.querySelector<HTMLElement>(".source-part-document")?.focus();
    }
  }, [visible]);
  const remember = (): void => {
    keepFocus.current = Boolean(hint.current?.contains(document.activeElement));
  };
  const dismiss = (): void => {
    remember();
    if (kind === "problem") {
      setChapterProblem(surface, null);
    } else {
      setDismissed(kind);
    }
  };
  const parent = sources.find((item) => item.id === source.partOf);
  const next = kind === "after" ? nextKnownPart(source, sources, surface) : undefined;
  const text = visible ? chapterHintText(kind, range, problem) : "";
  return (
    <>
      <span ref={announcer} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {visible ? (kind === "before" || kind === "after" ? `${text}: ${source.title}` : text) : ""}
      </span>
      {visible ? (
        <div
          ref={hint}
          className="source-reading-hint"
          role="group"
          aria-label={translate({ message: "Chapter reading range" })}
        >
          <span className="source-reading-hint-text">{text}</span>
          <span className="source-reading-hint-actions">
            {range.valid ? (
              <button
                type="button"
                onClick={() => {
                  remember();
                  void goToChapterStart(state);
                }}
              >
                {kind === "problem"
                  ? translate({ message: "Try again", context: "Reader interface" })
                  : translate({ message: "Back to chapter" })}
              </button>
            ) : (
              <button type="button" onClick={dismiss}>
                <Trans>Read the whole file</Trans>
              </button>
            )}
            {next ? (
              <SourceReadingLink
                source={source}
                id={next.id}
                open={open}
                label={translate`Next part: ${next.title}`}
                title={translate`Next part: ${next.title}`}
              />
            ) : null}
            {source.partOf ? (
              <SourceReadingLink
                source={source}
                id={source.partOf}
                open={open}
                label={translate({ message: "Continue in book" })}
                title={parent ? translate`Continue in the book: ${parent.title}` : undefined}
              />
            ) : null}
          </span>
          {range.valid ? (
            <button
              type="button"
              className="source-reading-hint-dismiss"
              aria-label={translate({ message: "Dismiss" })}
              title={translate({ message: "Dismiss" })}
              onClick={dismiss}
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function readingRangeLabel(source: SourceSummary, surface: ReadingSurface): string | undefined {
  const range = source.documents.find(
    (entry) => entry.fileId === surface.document.document.fileId,
  )?.range;
  switch (range?.kind) {
    case "pages":
      return translate`File pages ${String(range.start + 1)}–${String(range.end + 1)}`;
    case "epub-spine":
      return translate`Spine: ${range.start} – ${range.end}`;
    case "fragment":
      return range.end
        ? translate`Fragments: ${range.start} to before ${range.end}`
        : translate`Section: ${range.start}`;
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
  title,
  open,
}: {
  readonly source: SourceSummary;
  readonly id: SourceId;
  readonly label: string;
  readonly title?: string | undefined;
  readonly open: (id: SourceId) => void;
}): JSX.Element {
  return (
    <a
      href={`?collection=${encodeURIComponent(source.collectionId)}&source=${encodeURIComponent(id)}`}
      title={title}
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
