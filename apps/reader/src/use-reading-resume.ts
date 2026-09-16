import { useEffect, useRef, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { restoredSessionLocation } from "./session-reading-locations.js";

import type { FileId, ReadingPosition, Source, SourceId } from "@mdbase-reader/core";
import type { ReaderLocator, ReadingSurface } from "@mdbase-reader/reading-surface";

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
  ) => Promise<void>;
}): ReadingResumeState {
  const [state, setState] = useState<ReadingResumeState>({ status: "idle" });
  const resumed = useRef<ReadingSurface | null>(null);
  const saveRef = useRef(input.save);
  const queue = useRef(Promise.resolve());
  const { source, surface } = input;
  const sourceId =
    source &&
    surface &&
    source.documents.some(
      (document) =>
        document.fileId === surface.document.document.fileId &&
        document.revision === surface.document.document.revision,
    )
      ? source.id
      : undefined;

  useEffect(() => {
    saveRef.current = input.save;
  }, [input.save]);

  useEffect(() => {
    if (!source || !surface || !sourceId) {
      return;
    }
    if (resumed.current === surface) {
      return;
    }
    resumed.current = surface;
    const local = restoredSessionLocation(surface);
    if (local) {
      void surface
        .goTo(local)
        .catch(() =>
          setState({ status: "error", message: "Could not restore this tab’s reading position." }),
        );
      return;
    }
    const reading = source.reading;
    if (
      reading?.position &&
      reading.documentFileId === surface.document.document.fileId &&
      reading.position.kind === surface.kind
    ) {
      void surface
        .goTo(reading.position)
        .catch(() =>
          setState({ status: "error", message: "Could not restore the saved reading position." }),
        );
    }
  }, [source, sourceId, surface]);

  useEffect(() => {
    if (!sourceId || !surface) {
      return;
    }
    const saveForSource = saveRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest: ReaderLocator | null = null;
    const persist = (locator: ReaderLocator, report = true): void => {
      if (report) {
        setState({ status: "saving" });
      }
      queue.current = queue.current
        .then(() => saveForSource(sourceId, surface.document.document.fileId, locator))
        .then(() => (report ? setState({ status: "saved" }) : undefined))
        .catch((reason: unknown) => {
          if (report) {
            setState({
              status: "error",
              message: readerErrorMessage(reason, "Reader could not save your reading position."),
            });
          }
        });
    };
    // Opening at the top is still reading: record it even if no scroll event fires.
    const initialLocation = restoredSessionLocation(surface) ?? surface.currentLocation();
    if (initialLocation) {
      latest = initialLocation;
      timer = setTimeout(() => persist(initialLocation), 1_200);
    }
    const unsubscribe = surface.locations.subscribe((locator) => {
      latest = locator;
      clearTimeout(timer);
      timer = setTimeout(() => persist(locator), 1_200);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
      if (latest) {
        persist(latest, false);
      }
    };
  }, [sourceId, surface]);

  return state;
}
