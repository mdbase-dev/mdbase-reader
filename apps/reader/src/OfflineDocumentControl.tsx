import { useState, type JSX } from "react";

import { readerErrorMessage } from "./errors.js";
import { CheckIcon, OfflineIcon } from "./icons.js";
import { keepOfflineDocument, removeOfflineDocument } from "./offline-documents.js";

import type { CollectionId, DocumentHandle, DocumentTarget } from "@mdbase-reader/core";

export function OfflineDocumentControl({
  collection,
  target,
  handle,
  initiallyCached,
}: {
  readonly collection: CollectionId;
  readonly target: DocumentTarget;
  readonly handle: DocumentHandle;
  readonly initiallyCached: boolean;
}): JSX.Element {
  const [cached, setCached] = useState(initiallyCached);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const change = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      if (cached) {
        await removeOfflineDocument(collection, target);
      } else {
        await keepOfflineDocument(collection, target, handle);
      }
      setCached(!cached);
    } catch (reason) {
      setProblem(readerErrorMessage(reason, "Could not update the offline copy."));
    } finally {
      setBusy(false);
    }
  };
  const explanation =
    "Offline copies are device-local snapshots of the file when saved. " +
    "Signing in and discovering collections still need a connection, and your browser " +
    "may clear stored copies. Up to 64 MB per file, 128 MB in total.";
  return (
    <div className={`offline-document-control${cached ? " is-cached" : ""}`}>
      <button
        type="button"
        disabled={busy}
        aria-label={cached ? "Remove offline copy" : "Keep offline"}
        title={cached ? `Available offline. Click to remove.\n\n${explanation}` : explanation}
        onClick={() => void change()}
      >
        {cached ? <CheckIcon /> : <OfflineIcon />}
        <span role="status">
          {busy ? "Updating…" : cached ? "Available offline" : "Keep offline"}
        </span>
      </button>
      {problem ? <p role="alert">{problem}</p> : null}
    </div>
  );
}
