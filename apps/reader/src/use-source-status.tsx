import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { readerErrorMessage } from "./errors.js";
import { readingStatusLabel } from "./LibraryCells.js";
import { ReaderNotice } from "./ReaderNotice.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReadingStatus, Source, SourceId, SourceSummary } from "@mdbase-reader/core";

export function useSourceStatus(
  gateway: ReaderWorkspaceGateway,
  sources: readonly SourceSummary[],
  reconcile: (source: Source) => void,
): {
  readonly change: ((id: SourceId, status: ReadingStatus) => void) | undefined;
  readonly notice: ReactNode;
} {
  const [notice, setNotice] = useState<{
    readonly message: string;
    readonly undo?: () => void;
  } | null>(null);
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const change = useCallback(
    (id: SourceId, status: ReadingStatus): void => {
      const source = sources.find((item) => item.id === id);
      const save = gateway.saveReadingStatus?.bind(gateway);
      if (!source || !save) {
        return;
      }
      const previous = source.reading?.status ?? source.readingStatus ?? "inbox";
      setNotice(null);
      const fail = (reason: unknown): void =>
        setNotice({
          message: readerErrorMessage(reason, t`Reader could not change the reading status.`),
        });
      void save(id, status).then((updated) => {
        reconcile(updated);
        const label = readingStatusLabel(status);
        setNotice({
          message: t`“${source.title}” — ${label}`,
          undo: () => {
            setNotice(null);
            void save(id, previous).then((restored) => {
              reconcile(restored);
              setNotice({ message: t`Restored the status of “${source.title}”.` });
            }, fail);
          },
        });
      }, fail);
    },
    [gateway, sources, reconcile],
  );
  return {
    change: gateway.saveReadingStatus ? change : undefined,
    notice: notice ? (
      <ReaderNotice onUndo={notice.undo}>
        <span role="status">{notice.message}</span>
        {notice.undo ? (
          <button type="button" onClick={notice.undo} aria-keyshortcuts="Control+Z Meta+Z">
            <Trans context="Reader interface">Undo</Trans>
          </button>
        ) : null}
      </ReaderNotice>
    ) : null,
  };
}
