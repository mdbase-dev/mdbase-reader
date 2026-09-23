import { connectProblemMessage, type ReaderConnectSnapshot } from "@mdbase-reader/connect";

import { readerSession } from "./connect.js";

import type { JSX } from "react";
export function ImportDestination({
  session,
  disabled,
  onError,
}: {
  session: ReaderConnectSnapshot;
  disabled: boolean;
  onError: (message: string) => void;
}): JSX.Element {
  const choose = async (): Promise<void> => {
    try {
      const result = await readerSession.authorize("choose", true);
      const message = connectProblemMessage(result);
      if (message) {
        onError(message);
      }
    } catch {
      onError("Could not open mdbase approval. Allow popups and try again.");
    }
  };
  return (
    <section aria-labelledby="import-destination-title">
      <h2 id="import-destination-title">Destination</h2>
      <p>
        Choose an existing collection, or create a fresh hosted collection in mdbase’s secure
        approval window.
      </p>
      <label>
        Collection
        <select
          disabled={disabled}
          value={"collectionId" in session ? session.collectionId : ""}
          onChange={(event) => {
            const outcome = readerSession.select(event.target.value);
            const message = connectProblemMessage(outcome);
            if (message) {
              onError(message);
            }
          }}
        >
          <option value="" disabled>
            Select a collection
          </option>
          {session.connections.map((c) => (
            <option key={c.collectionId} value={c.collectionId}>
              {c.displayName}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={disabled} onClick={() => void choose()}>
        Create or connect a collection…
      </button>
      {session.status === "setup_review_required" ? (
        <div>
          <p>
            This collection needs Reader’s source and annotation types. No library content will be
            imported until you confirm below.
          </p>
          <button
            type="button"
            disabled={disabled || !session.update.canApply}
            onClick={() => {
              void readerSession
                .applyCollectionSetup()
                .then((result) => {
                  const message = connectProblemMessage(result);
                  if (message) {
                    onError(message);
                  }
                })
                .catch(() => onError("Collection setup failed."));
            }}
          >
            Apply Reader collection setup
          </button>
        </div>
      ) : null}
      {session.status === "authorization_required" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            void readerSession
              .authorize("selected", true)
              .then((result) => {
                const message = connectProblemMessage(result);
                if (message) {
                  onError(message);
                }
              })
              .catch(() => onError("Collection authorization failed."));
          }}
        >
          Review collection access
        </button>
      ) : null}
      {session.status !== "ready" ? (
        <p role="status">Collection connection: {session.status.replaceAll("_", " ")}</p>
      ) : null}
    </section>
  );
}
