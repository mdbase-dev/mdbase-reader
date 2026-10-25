import { useEffect, useRef, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import {
  hasExplicitReadingNavigation,
  restoreReadingLocation,
} from "./reading-navigation-priority.js";
import { restoredSessionLocation } from "./session-reading-locations.js";
import {
  positionWithinReadingRange,
  resolveSourceReadingRange,
  sourceReadingContextKey,
  surfaceReadingContextKey,
} from "./source-reading-range.js";

import type { FileId, ReadingPosition, Source, SourceId } from "@mdbase-reader/core";
import type {
  ReaderLocator,
  ReadingRangeResolution,
  ReadingSurface,
} from "@mdbase-reader/reading-surface";

export interface ReadingResumeState {
  readonly status: "idle" | "saving" | "saved" | "error";
  readonly message?: string;
}

export function useReadingResume(input: {
  readonly source: Source | null;
  readonly surface: ReadingSurface | null;
  readonly save: (
    sourceId: SourceId,
    documentFileId: FileId,
    position: ReadingPosition,
    progress?: number | null,
  ) => Promise<void>;
}): ReadingResumeState {
  const [state, setState] = useState<ReadingResumeState>({ status: "idle" });
  const resumed = useRef(new WeakMap<ReadingSurface, ResumeMark>());
  const sourceRef = useRef(input.source);
  const saveRef = useRef(input.save);
  const queue = useRef(Promise.resolve());
  const { source, surface } = input;
  const contextKey = source ? sourceReadingContextKey(source) : "";
  const sourceId =
    source &&
    surface &&
    (!surfaceReadingContextKey(surface) || surfaceReadingContextKey(surface) === contextKey) &&
    source.documents.some(
      (document) =>
        document.fileId === surface.document.document.fileId &&
        document.revision === surface.document.document.revision,
    )
      ? source.id
      : undefined;

  useEffect(() => {
    saveRef.current = input.save;
    sourceRef.current = input.source;
  }, [input.save, input.source]);

  useEffect(() => {
    const current = sourceRef.current;
    if (!current || !surface || !sourceId) {
      return;
    }
    const currentResumptions = resumed.current;
    const lifecycle = { active: true };
    const isActive = (): boolean => lifecycle.active;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest: ReaderLocator | null = null;
    let progress: number | null | undefined;
    const saveForSource = saveRef.current;
    const persist = (
      locator: ReaderLocator,
      value: number | null | undefined,
      report = true,
    ): void => {
      if (report) {
        setState({ status: "saving" });
      }
      const mark = currentResumptions.get(surface);
      if (mark?.key === contextKey) {
        rememberWrite(mark, locator);
      }
      queue.current = queue.current
        .then(() => saveForSource(sourceId, surface.document.document.fileId, locator, value))
        .then(() => {
          if (report && lifecycle.active) {
            setState({ status: "saved" });
          }
        })
        .catch((reason: unknown) => {
          if (report && lifecycle.active) {
            setState({
              status: "error",
              message: readerErrorMessage(reason, "Reader could not save your reading position."),
            });
          }
        });
    };
    void (async () => {
      const range = await resolveSourceReadingRange(current, surface);
      if (!isActive() || (range && !range.valid)) {
        return;
      }
      await resumeSourcePosition(current, surface, range, contextKey, currentResumptions);
      if (!isActive()) {
        return;
      }
      setState({ status: "idle" });
      const update = (locator: ReaderLocator): void => {
        latest = locator;
        progress = range?.valid ? (range.measure(locator)?.progress ?? null) : undefined;
        clearTimeout(timer);
        timer = setTimeout(() => persist(locator, progress), 1_200);
      };
      unsubscribe = surface.locations.subscribe(update);
      const initial = surface.currentLocation();
      if (initial) {
        update(initial);
      }
    })().catch((reason: unknown) => {
      if (lifecycle.active) {
        setState({
          status: "error",
          message: readerErrorMessage(reason, "Could not restore the saved reading position."),
        });
      }
    });
    return () => {
      lifecycle.active = false;
      // Keep the resumption mark: the source record briefly unloads after each position save, and
      // resuming from our own write would pull a reader browsing outside a chapter to its start.
      unsubscribe?.();
      clearTimeout(timer);
      if (latest) {
        persist(latest, progress, false);
      }
    };
  }, [contextKey, sourceId, surface]);

  return state;
}

/**
 * What a surface last resumed for a source context: the saved position it saw then and the
 * positions it has written since. A reload that shows one of these is the surface's own state; any
 * other saved position was written elsewhere (another tab or device) and is restored.
 */
interface ResumeMark {
  readonly key: string;
  seen: string | undefined;
  readonly written: string[];
}

const rememberedWrites = 20;

function rememberWrite(mark: ResumeMark, locator: ReaderLocator): void {
  mark.written.push(locatorKey(locator));
  if (mark.written.length > rememberedWrites) {
    mark.written.shift();
  }
}

/** Compares locators by value, whatever order a store returns their fields in. */
function locatorKey(locator: ReaderLocator): string {
  return JSON.stringify(locator, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

/** Where to resume, or null when this surface should stay where it is. */
function resumeLocation(
  stored: ReaderLocator | undefined,
  storedKey: string | undefined,
  surface: ReadingSurface,
  mark: ResumeMark | undefined,
  key: string,
): { readonly saved: ReaderLocator | undefined } | null {
  if (mark?.key === key) {
    // Only a position saved elsewhere while this surface was inactive is newer than its own.
    return !storedKey || storedKey === mark.seen || mark.written.includes(storedKey)
      ? null
      : { saved: stored };
  }
  return hasExplicitReadingNavigation(surface)
    ? null
    : { saved: restoredSessionLocation(surface) ?? stored };
}

async function resumeSourcePosition(
  source: Source,
  surface: ReadingSurface,
  range: ReadingRangeResolution | null,
  key: string,
  resumed: WeakMap<ReadingSurface, ResumeMark>,
): Promise<void> {
  const stored = savedSourcePosition(source, surface);
  const storedKey = stored ? locatorKey(stored) : undefined;
  const target = resumeLocation(stored, storedKey, surface, resumed.get(surface), key);
  if (!target) {
    return;
  }
  const { saved } = target;
  const within = saved && (!range || positionWithinReadingRange(range, saved));
  const start = within ? saved : range?.valid ? range.start : undefined;
  resumed.set(surface, { key, seen: storedKey, written: [] });
  if (start && !(await restoreReadingLocation(surface, start))) {
    throw new Error("The saved reading position could not be opened.");
  }
}

function savedSourcePosition(source: Source, surface: ReadingSurface): ReaderLocator | undefined {
  const reading = source.reading;
  return reading?.documentFileId === surface.document.document.fileId &&
    reading.position?.kind === surface.kind
    ? reading.position
    : undefined;
}
