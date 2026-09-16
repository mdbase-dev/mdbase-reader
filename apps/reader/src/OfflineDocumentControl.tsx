import { useState, type JSX } from "react";

import { readerErrorMessage } from "./errors.js";
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
  return (
    <div className="offline-document-control">
      <span role="status">
        {cached ? "Exact revision saved on this device" : "Not saved for offline reading"}
      </span>
      <details>
        <summary>Offline details</summary>
        <p>
          Offline copies are device-local and verified against the exact file revision. Open the
          collection while connected first; signing in and discovering collections still need
          Connect. Browser storage may be cleared by your browser. Up to 64 MB per file, 128 MB
          total.
        </p>
      </details>
      <button type="button" disabled={busy} onClick={() => void change()}>
        {busy ? "Updating…" : cached ? "Remove offline copy" : "Keep offline"}
      </button>
      {problem ? <p role="alert">{problem}</p> : null}
    </div>
  );
}
