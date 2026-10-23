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
  readonly notice?: string;
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
  const resumed = useRef(new WeakMap<ReadingSurface, string>());
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
    let notice: string | undefined;
    const persist = (
      locator: ReaderLocator,
      value: number | null | undefined,
      report = true,
    ): void => {
      if (report) {
        setState({ status: "saving", ...(notice ? { notice } : {}) });
      }
      queue.current = queue.current
        .then(() => saveForSource(sourceId, surface.document.document.fileId, locator, value))
        .then(() => {
          if (report && lifecycle.active) {
            setState({ status: "saved", ...(notice ? { notice } : {}) });
          }
        })
        .catch((reason: unknown) => {
          if (report && lifecycle.active) {
            setState({
              status: "error",
              message: readerErrorMessage(reason, "Reader could not save your reading position."),
              ...(notice ? { notice } : {}),
            });
          }
        });
    };
    void (async () => {
      const range = await resolveSourceReadingRange(current, surface);
      if (!isActive() || (range && !range.valid)) {
        return;
      }
      notice = await resumeSourcePosition(current, surface, range, contextKey, currentResumptions);
      if (!isActive()) {
        return;
      }
      setState({ status: "idle", ...(notice ? { notice } : {}) });
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
      currentResumptions.delete(surface);
      unsubscribe?.();
      clearTimeout(timer);
      if (latest) {
        persist(latest, progress, false);
      }
    };
  }, [contextKey, sourceId, surface]);

  return state;
}

async function resumeSourcePosition(
  source: Source,
  surface: ReadingSurface,
  range: ReadingRangeResolution | null,
  key: string,
  resumed: WeakMap<ReadingSurface, string>,
): Promise<string | undefined> {
  if (resumed.get(surface) === key || hasExplicitReadingNavigation(surface)) {
    return undefined;
  }
  const saved = restoredSessionLocation(surface) ?? savedSourcePosition(source, surface);
  const within = saved && (!range || positionWithinReadingRange(range, saved));
  const notice =
    saved && range && !within
      ? "Saved position is outside this chapter or could not be verified. Started at the chapter start."
      : undefined;
  const start = within ? saved : range?.valid ? range.start : undefined;
  resumed.set(surface, key);
  if (start && !(await restoreReadingLocation(surface, start))) {
    throw new Error("The saved reading position could not be opened.");
  }
  return notice;
}

function savedSourcePosition(source: Source, surface: ReadingSurface): ReaderLocator | undefined {
  const reading = source.reading;
  return reading?.documentFileId === surface.document.document.fileId &&
    reading.position?.kind === surface.kind
    ? reading.position
    : undefined;
}
