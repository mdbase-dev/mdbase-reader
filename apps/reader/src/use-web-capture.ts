import { t } from "@lingui/core/macro";
import { signalMdbaseMark, useMdbaseMarkBusy } from "@mdbase-dev/ui/mark-activity";
import { useCallback, useRef, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { useCaptureTask } from "./use-capture-task.js";
import { useChapterDoi } from "./use-chapter-doi.js";

import type { ChapterDoiOffer } from "./chapter-doi.js";
import type * as SourceAdditionFlow from "./source-addition-flow.js";
import type {
  SourceAdditionNotice,
  SourceAdditionOutcome,
  SourceAdditionServices,
} from "./source-addition-flow.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { CitationCandidate, SourceId } from "@mdbase-reader/core";

export interface WebCaptureFlow {
  readonly chapterOffer: ChapterDoiOffer | null;
  readonly bookOffer: CitationCandidate | null;
  readonly confirmChapter: (bookId: SourceId) => Promise<void>;
  readonly findChapterBook: (isbn?: string) => Promise<void>;
  readonly saveChapterBook: () => Promise<void>;
  readonly status: "idle" | "capturing";
  /** What the current addition is doing, for a live status line. */
  readonly progress: string | null;
  readonly error: string | null;
  /** A page could not be fetched but its citation was found; it can be saved on its own. */
  readonly offer: { readonly title: string; readonly reason: string } | null;
  /** A source was added with a problem worth reading before it opens. */
  readonly notice: {
    readonly message: string;
    readonly detail?: string;
    readonly sourceId: SourceId;
  } | null;
  readonly canCancel: boolean;
  readonly cancel: () => void;
  readonly capture: (input: string) => Promise<void>;
  readonly saveCitationOnly: () => Promise<void>;
  readonly openNoticed: () => void;
  readonly clearError: () => void;
}

/** Adds a source from a pasted link or identifier (see source-addition-flow). */
export function useWebCapture(
  workspace: ReaderWorkspaceController,
  onImported: (sourceId: SourceId) => void,
  gateway?: ReaderWorkspaceGateway,
): WebCaptureFlow {
  const chapter = useChapterDoi(gateway, workspace, onImported);
  const proposeChapter = chapter.propose;
  const { status, progress, canCancel, cancel, begin } = useCaptureTask();
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<{
    readonly candidate: CitationCandidate;
    readonly url: string;
    readonly reason: string;
  } | null>(null);
  const [notice, setNotice] = useState<WebCaptureFlow["notice"]>(null);
  const recoveryInput = useRef<string | null>(null);
  // Fetching, reading and looking up a page has no measurable progress.
  useMdbaseMarkBusy(status === "capturing" && "scan");

  const run = useCallback(
    async (
      input: string,
      work: (
        services: SourceAdditionServices,
        flow: typeof SourceAdditionFlow,
      ) => Promise<SourceAdditionOutcome>,
    ): Promise<void> => {
      const operation = begin();
      if (!operation) {
        return;
      }
      setError(null);
      setOffer(null);
      setNotice(null);
      try {
        // The article extractor, metadata extractors and PDFium load only when a source is added.
        const [flow, { readerSourceAdditionServices }] = await Promise.all([
          import("./source-addition-flow.js"),
          import("./source-addition-services.js"),
        ]);
        operation.signal.throwIfAborted();
        const outcome = await work(
          readerSourceAdditionServices({
            workspace,
            chapterGateway: gateway,
            signal: operation.signal,
            onStatus: operation.onStatus,
            onWriteStart: operation.onWriteStart,
            ...(recoveryInput.current === input
              ? { importOptions: { recoverExistingFiles: true } }
              : {}),
          }),
          flow,
        );
        if (!operation.isCurrent()) {
          return;
        }
        if (outcome.kind === "chapter-offer") {
          proposeChapter(outcome.offer);
        } else if (outcome.kind === "citation-only") {
          setOffer({ candidate: outcome.candidate, url: input, reason: outcome.reason });
        } else if (outcome.kind === "not-added") {
          // The workspace reports why; the input is kept to recover the upload on retry.
          signalMdbaseMark("error");
          recoveryInput.current = input;
        } else {
          signalMdbaseMark("saved");
          recoveryInput.current = null;
          if (outcome.notices.length) {
            setNotice(additionNotice(outcome.notices, outcome.source.id));
          } else {
            onImported(outcome.source.id);
          }
        }
      } catch (reason) {
        if (operation.isCurrent()) {
          signalMdbaseMark("error");
          setError(readerErrorMessage(reason, t({ message: "Reader could not add that source." })));
        }
      } finally {
        operation.finish();
      }
    },
    [onImported, workspace, gateway, proposeChapter, begin],
  );

  const saveCitationOnly = useCallback((): Promise<void> => {
    if (!offer) {
      return Promise.resolve();
    }
    const { candidate, url } = offer;
    return run(url, (services, flow) => flow.createWithoutDocument(candidate, url, services));
  }, [offer, run]);

  return {
    chapterOffer: chapter.chapterOffer,
    bookOffer: chapter.bookOffer,
    confirmChapter: chapter.confirmChapter,
    findChapterBook: chapter.findChapterBook,
    saveChapterBook: chapter.saveChapterBook,
    status: chapter.busy ? "capturing" : status,
    progress,
    error: error ?? chapter.error ?? workspace.importError,
    offer: citationOffer(offer),
    notice,
    canCancel: canCancel || chapter.canCancel,
    cancel: chapter.busy ? chapter.cancel : cancel,
    capture: (input) => run(input, (services, flow) => flow.addSourceFromInput(input, services)),
    saveCitationOnly,
    openNoticed: () => {
      if (notice) {
        setNotice(null);
        onImported(notice.sourceId);
      }
    },
    clearError: () => {
      setError(null);
      setOffer(null);
      proposeChapter(null);
    },
  };
}

function citationOffer(
  offer: { candidate: CitationCandidate; url: string; reason: string } | null,
): WebCaptureFlow["offer"] {
  return offer
    ? {
        title:
          typeof offer.candidate.citation["title"] === "string"
            ? offer.candidate.citation["title"]
            : offer.url,
        reason: offer.reason,
      }
    : null;
}

/** Notices read as one message; their underlying errors stay together in its details. */
function additionNotice(
  notices: readonly SourceAdditionNotice[],
  sourceId: SourceId,
): NonNullable<WebCaptureFlow["notice"]> {
  const detail = notices.flatMap((notice) => notice.detail ?? []).join(" ");
  return {
    message: notices.map((notice) => notice.message).join(" "),
    ...(detail ? { detail } : {}),
    sourceId,
  };
}
