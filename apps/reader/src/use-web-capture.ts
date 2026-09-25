import { useCallback, useRef, useState } from "react";

import { readerErrorMessage } from "./errors.js";

import type * as SourceAdditionFlow from "./source-addition-flow.js";
import type { SourceAdditionOutcome, SourceAdditionServices } from "./source-addition-flow.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { CitationCandidate, SourceId } from "@mdbase-reader/core";

export interface WebCaptureFlow {
  readonly status: "idle" | "capturing";
  /** What the current addition is doing, for a live status line. */
  readonly progress: string | null;
  readonly error: string | null;
  /** A page could not be fetched but its citation was found; it can be saved on its own. */
  readonly offer: { readonly title: string; readonly reason: string } | null;
  /** A source was added with a problem worth reading before it opens. */
  readonly notice: { readonly message: string; readonly sourceId: SourceId } | null;
  readonly capture: (input: string) => Promise<void>;
  readonly saveCitationOnly: () => Promise<void>;
  readonly openNoticed: () => void;
  readonly clearError: () => void;
}

/** Adds a source from a pasted link or identifier (see source-addition-flow). */
export function useWebCapture(
  workspace: ReaderWorkspaceController,
  onImported: (sourceId: SourceId) => void,
): WebCaptureFlow {
  const [status, setStatus] = useState<WebCaptureFlow["status"]>("idle");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<{
    readonly candidate: CitationCandidate;
    readonly url: string;
    readonly reason: string;
  } | null>(null);
  const [notice, setNotice] = useState<WebCaptureFlow["notice"]>(null);
  const recoveryInput = useRef<string | null>(null);

  const run = useCallback(
    async (
      input: string,
      work: (
        services: SourceAdditionServices,
        flow: typeof SourceAdditionFlow,
      ) => Promise<SourceAdditionOutcome>,
    ): Promise<void> => {
      setStatus("capturing");
      setError(null);
      setOffer(null);
      setNotice(null);
      try {
        // Readability, the metadata extractors and PDFium load only when a source is added.
        const [flow, { readerSourceAdditionServices }] = await Promise.all([
          import("./source-addition-flow.js"),
          import("./source-addition-services.js"),
        ]);
        const outcome = await work(
          readerSourceAdditionServices({
            workspace,
            onStatus: setProgress,
            ...(recoveryInput.current === input
              ? { importOptions: { recoverExistingFiles: true } }
              : {}),
          }),
          flow,
        );
        if (outcome.kind === "citation-only") {
          setOffer({ candidate: outcome.candidate, url: input, reason: outcome.reason });
        } else if (outcome.kind === "not-added") {
          recoveryInput.current = input;
        } else {
          recoveryInput.current = null;
          if (outcome.notices.length) {
            setNotice({ message: outcome.notices.join(" "), sourceId: outcome.source.id });
          } else {
            onImported(outcome.source.id);
          }
        }
      } catch (reason) {
        setError(readerErrorMessage(reason, "Reader could not add that source."));
      } finally {
        setStatus("idle");
        setProgress(null);
      }
    },
    [onImported, workspace],
  );

  const capture = useCallback(
    (input: string): Promise<void> =>
      run(input, (services, flow) => flow.addSourceFromInput(input, services)),
    [run],
  );
  const saveCitationOnly = useCallback((): Promise<void> => {
    if (!offer) {
      return Promise.resolve();
    }
    const { candidate, url } = offer;
    return run(url, (services, flow) => flow.createWithoutDocument(candidate, url, services));
  }, [offer, run]);

  return {
    status,
    progress,
    error: error ?? workspace.importError,
    offer: offer
      ? {
          title:
            typeof offer.candidate.citation["title"] === "string"
              ? offer.candidate.citation["title"]
              : offer.url,
          reason: offer.reason,
        }
      : null,
    notice,
    capture,
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
    },
  };
}
