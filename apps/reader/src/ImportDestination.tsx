import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Select } from "@mdbase-dev/ui/select";
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
  const { t } = useLingui();
  const choose = async (): Promise<void> => {
    try {
      const result = await readerSession.authorize("choose", true);
      const message = connectProblemMessage(result);
      if (message) {
        onError(message);
      }
    } catch {
      onError(
        translate({ message: "Could not open mdbase approval. Allow popups and try again." }),
      );
    }
  };
  return (
    <section className="import-step" aria-labelledby="import-destination-title">
      <h2 id="import-destination-title">
        <Trans>Choose a destination</Trans>
      </h2>
      <p>
        <Trans>
          Choose an existing collection, or create a fresh hosted collection in mdbase’s secure
          approval window.
        </Trans>
      </p>
      <label>
        {t({ message: "Collection" })}
        <Select
          aria-label={t({ message: "Collection", context: "ImportDestination interface" })}
          disabled={disabled}
          value={"collectionId" in session ? session.collectionId : ""}
          placeholder={t({ message: "Select a collection" })}
          options={session.connections.map((c) => ({
            value: c.collectionId,
            label: c.displayName,
          }))}
          onChange={(collectionId) => {
            const message = connectProblemMessage(readerSession.select(collectionId));
            if (message) {
              onError(message);
            }
          }}
        />
      </label>
      <button type="button" disabled={disabled} onClick={() => void choose()}>
        <Trans>Create or connect a collection…</Trans>
      </button>
      {session.status === "setup_review_required" ? (
        <div>
          <p>
            <Trans>
              This collection needs Reader’s source and annotation types. No library content will be
              imported until you confirm below.
            </Trans>
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
                .catch(() => onError(translate({ message: "Collection setup failed." })));
            }}
          >
            <Trans>Apply Reader collection setup</Trans>
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
              .catch(() => onError(translate({ message: "Collection authorization failed." })));
          }}
        >
          <Trans>Review collection access</Trans>
        </button>
      ) : null}
      {session.status !== "ready" ? <p role="status">{destinationStatus(session.status)}</p> : null}
    </section>
  );
}

function destinationStatus(status: ReaderConnectSnapshot["status"]): string {
  switch (status) {
    case "authorization_required":
      return translate({ message: "Reader needs your approval to write to this collection." });
    case "setup_review_required":
      return translate({ message: "This collection needs Reader’s setup before importing." });
    case "not_started":
    case "starting":
    case "checking_setup":
      return translate({ message: "Connecting to mdbase…" });
    case "start_failed":
    case "unavailable":
    case "blocked":
      return translate({
        message: "mdbase isn’t reachable right now. Check your connection and try again.",
      });
    default:
      return translate({ message: "Choose a collection to import into." });
  }
}
