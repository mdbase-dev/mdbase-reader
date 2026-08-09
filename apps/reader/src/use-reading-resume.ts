import { useEffect, useRef, useState } from "react";

import { readerErrorMessage } from "./errors.js";

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
  const resumed = useRef<string | null>(null);
  const saveRef = useRef(input.save);
  const queue = useRef(Promise.resolve());
  const { source, surface } = input;
  const sourceId = source?.id;

  useEffect(() => {
    saveRef.current = input.save;
  }, [input.save]);

  useEffect(() => {
    if (!source || !surface) {
      return;
    }
    const key = `${source.id}:${surface.document.document.fileId}:${surface.document.document.revision}`;
    if (resumed.current === key) {
      return;
    }
    resumed.current = key;
    const reading = source.reading;
    if (
      reading?.position &&
      reading.documentFileId === surface.document.document.fileId &&
      reading.position.kind === surface.kind
    ) {
      void surface.goTo(reading.position);
    }
  }, [source, surface]);

  useEffect(() => {
    if (!sourceId || !surface) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest: ReaderLocator | null = null;
    const persist = (locator: ReaderLocator, report = true): void => {
      if (report) {
        setState({ status: "saving" });
      }
      queue.current = queue.current
        .then(() => saveRef.current(sourceId, surface.document.document.fileId, locator))
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
