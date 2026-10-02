import { signalMdbaseMark } from "@mdbase-dev/ui/mark-activity";
import { useCallback, useMemo } from "react";

import { propertyValue } from "./library-columns.js";
import { parseFieldInput } from "./library-field-edit.js";
import { markFraction, withMarkProgress } from "./mark-activity.js";

import type { FieldShape } from "./library-conditions.js";
import type { BulkStatusProgress } from "./LibraryBulkBar.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReadingStatus, Source, SourceSummary } from "@mdbase-reader/core";

type Progress = (value: BulkStatusProgress) => void;

export interface LibraryWrites {
  /** Sets one reading status on many sources. */
  readonly setStatuses?: (
    sources: readonly SourceSummary[],
    status: ReadingStatus,
    progress: Progress,
  ) => Promise<void>;
  /** Sets one field, from typed text, on many sources, keeping each source's value kind. */
  readonly setFields?: (
    sources: readonly SourceSummary[],
    key: string,
    text: string,
    progress: Progress,
  ) => Promise<void>;
  /** Sets one field on one source from a cell edit. */
  readonly saveField?: (source: SourceSummary, key: string, text: string) => Promise<void>;
}

/** Library writes, run a few at a time, each reported back so the library updates at once. */
export function useLibraryWrites(
  gateway: ReaderWorkspaceGateway,
  onSourceChanged: ((source: Source) => void) | undefined,
  shapeOf: (key: string) => FieldShape,
): LibraryWrites {
  const saveStatus = gateway.saveReadingStatus?.bind(gateway);
  const saveFields = gateway.saveSourceFields?.bind(gateway);
  const fieldValue = useCallback(
    (source: SourceSummary, key: string, text: string): unknown =>
      parseFieldInput(text, propertyValue(source, key), shapeOf(key)),
    [shapeOf],
  );
  const setStatuses = useCallback(
    (sources: readonly SourceSummary[], status: ReadingStatus, progress: Progress) =>
      eachSource(sources, progress, async (source) => {
        if (saveStatus) {
          onSourceChanged?.(await saveStatus(source.id, status));
        }
      }),
    [onSourceChanged, saveStatus],
  );
  const setFields = useCallback(
    (sources: readonly SourceSummary[], key: string, text: string, progress: Progress) =>
      eachSource(sources, progress, async (source) => {
        if (saveFields) {
          onSourceChanged?.(await saveFields(source.id, { [key]: fieldValue(source, key, text) }));
        }
      }),
    [fieldValue, onSourceChanged, saveFields],
  );
  const saveField = useCallback(
    async (source: SourceSummary, key: string, text: string): Promise<void> => {
      if (!saveFields) {
        return;
      }
      try {
        onSourceChanged?.(await saveFields(source.id, { [key]: fieldValue(source, key, text) }));
      } catch (reason) {
        signalMdbaseMark("error");
        throw reason;
      }
      signalMdbaseMark("saved");
    },
    [fieldValue, onSourceChanged, saveFields],
  );
  return useMemo(
    () => ({
      ...(saveStatus ? { setStatuses } : {}),
      ...(saveFields ? { setFields, saveField } : {}),
    }),
    [saveField, saveFields, saveStatus, setFields, setStatuses],
  );
}

/** Exported for tests. Shows the run on the app mark, which shakes if any source failed. */
export async function eachSource(
  sources: readonly SourceSummary[],
  progress: Progress,
  write: (source: SourceSummary) => Promise<void>,
): Promise<void> {
  if (sources.length === 0) {
    return;
  }
  let done = 0;
  let failed = 0;
  const queue = [...sources];
  await withMarkProgress(
    async (mark) => {
      const worker = async (): Promise<void> => {
        for (let source = queue.shift(); source; source = queue.shift()) {
          try {
            await write(source);
          } catch {
            failed += 1;
          }
          done += 1;
          mark(markFraction(done, sources.length));
          progress({ done, total: sources.length, failed });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, sources.length) }, worker));
    },
    () => (failed > 0 ? "fail" : "finish"),
  );
}
