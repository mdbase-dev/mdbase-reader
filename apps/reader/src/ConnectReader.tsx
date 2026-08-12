import { connectProblemMessage, type ReaderConnectSnapshot } from "@mdbase-reader/connect";
import { createReaderRuntimeServices, createWebPlatform } from "@mdbase-reader/platform";
import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from "react";

import { ConnectWorkspaceGateway } from "./connect-workspace.js";
import { readerSession } from "./connect.js";
import { ConnectedDocument } from "./ConnectedDocument.js";
import { connectionStatus, isLocalhost, requiresAccessReview } from "./connection-recovery.js";
import { ConnectionLayout, ConnectionRetry } from "./ConnectionLayout.js";
import { readerErrorMessage } from "./errors.js";
import { ReaderApp } from "./ReaderApp.js";

const subscribe = (listener: () => void): (() => void) => readerSession.subscribe(listener);
const snapshot = (): ReaderConnectSnapshot => readerSession.getSnapshot();
const readerPlatform = createWebPlatform();
const runtimeServices = createReaderRuntimeServices(readerPlatform.storage);

export function ConnectReader(): JSX.Element {
  const session = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [error, setError] = useState<string | null>(null);

  const start = async (): Promise<void> => {
    setError(null);
    try {
      setError(connectProblemMessage(await readerSession.start()));
    } catch (reason) {
      setError(readerErrorMessage(reason, "Reader could not open this collection."));
    }
  };

  useEffect(() => {
    let active = true;
    void readerSession
      .start()
      .then((outcome) => {
        if (active) {
          setError(connectProblemMessage(outcome));
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(readerErrorMessage(reason, "Reader could not open this collection."));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (session.status === "ready") {
    return <OpenedReader collectionId={session.collectionId} />;
  }
  return (
    <ConnectionScreen
      session={session}
      error={error}
      onError={setError}
      onRetry={() => void start()}
    />
  );
}

function OpenedReader({ collectionId }: { readonly collectionId: string }): JSX.Element {
  const opened = useMemo(() => readerSession.connectedCollection(collectionId), [collectionId]);
  const gateway = useMemo(
    () =>
      opened
        ? new ConnectWorkspaceGateway(
            opened.sources,
            opened.annotations,
            opened.annotationAssets,
            opened.sourceImports,
            opened.collectionId,
            opened.collectionName,
            runtimeServices,
            opened.contentSearch,
            opened.files,
            opened.libraryViews,
          )
        : null,
    [opened],
  );
  if (!opened || !gateway) {
    return <ConnectionLayout status="The selected collection is no longer available." />;
  }
  return (
    <ReaderApp
      key={collectionId}
      gateway={gateway}
      directAccess={opened.directAccess}
      saveFile={(name, blob) => readerPlatform.saveFile(name, blob)}
      pickSourceFile={() =>
        readerPlatform.pickFile([
          ".pdf",
          ".epub",
          ".html",
          ".htm",
          "application/pdf",
          "application/epub+zip",
          "text/html",
        ])
      }
      renderDocument={(source, onSurfaceChange) => (
        <ConnectedDocument
          repository={opened.documents}
          source={source}
          onSurfaceChange={onSurfaceChange}
        />
      )}
    />
  );
}

function ConnectionScreen({
  session,
  error,
  onError,
  onRetry,
}: {
  readonly session: Exclude<ReaderConnectSnapshot, { status: "ready" }>;
  readonly error: string | null;
  readonly onError: (message: string | null) => void;
  readonly onRetry: () => void;
}): JSX.Element {
  const [working, setWorking] = useState(false);
  const selectedCollectionId = "collectionId" in session ? session.collectionId : null;

  const authorize = async (target: "choose" | "selected"): Promise<void> => {
    setWorking(true);
    onError(null);
    try {
      const outcome = await readerSession.authorize(target);
      onError(connectProblemMessage(outcome));
    } catch (reason) {
      onError(readerErrorMessage(reason, "Reader could not review application access."));
    } finally {
      setWorking(false);
    }
  };
  const applySetup = async (): Promise<void> => {
    setWorking(true);
    onError(null);
    try {
      const outcome = await readerSession.applyCollectionSetup();
      onError(connectProblemMessage(outcome));
    } catch (reason) {
      onError(readerErrorMessage(reason, "Reader could not apply the reviewed setup."));
    } finally {
      setWorking(false);
    }
  };
  const select = (collectionId: string): void => {
    onError(connectProblemMessage(readerSession.select(collectionId)));
  };

  return (
    <ConnectionLayout status={connectionStatus(session)} error={error}>
      {session.status === "setup_review_required" ? (
        <section className="connection-setup" aria-labelledby="reader-setup-title">
          <h2 id="reader-setup-title">Set up this reading collection</h2>
          <p>Only Reader’s source and annotation contracts and starter types will be added.</p>
          <ul>
            {session.update.typePacks.map((pack) => (
              <li key={pack.id}>
                {pack.name}: {pack.currentVersion ?? "not installed"} → {pack.desiredVersion}
              </li>
            ))}
          </ul>
          <ReaderButton
            disabled={working || !session.update.canApply}
            onClick={() => void applySetup()}
          >
            {working ? "Applying setup…" : "Apply reviewed setup"}
          </ReaderButton>
        </section>
      ) : null}
      <div className="connection-actions">
        <ConnectionRetry error={error} onRetry={onRetry} />
        {session.connections
          .filter(({ collectionId }) => collectionId !== selectedCollectionId)
          .map((connection) => (
            <ReaderButton
              key={connection.collectionId}
              onClick={() => select(connection.collectionId)}
            >
              Open {connection.displayName}
            </ReaderButton>
          ))}
        <SelectedAuthorizationAction
          session={session}
          error={error}
          working={working}
          hasSelectedCollection={Boolean(selectedCollectionId)}
          onAuthorize={() => void authorize("selected")}
        />
        <button
          className="connection-secondary"
          disabled={working}
          type="button"
          onClick={() => void authorize("choose")}
        >
          {working ? "Opening mdbase…" : "Connect another collection"}
        </button>
      </div>
      {isLocalhost(location) ? (
        <p className="connection-local-note">
          Local HTTP development uses the local Connect stack at <code>http://127.0.0.1:8787</code>.
          The managed service requires an HTTPS Reader origin.
        </p>
      ) : null}
    </ConnectionLayout>
  );
}

function SelectedAuthorizationAction({
  session,
  error,
  working,
  hasSelectedCollection,
  onAuthorize,
}: {
  readonly session: Exclude<ReaderConnectSnapshot, { status: "ready" }>;
  readonly error: string | null;
  readonly working: boolean;
  readonly hasSelectedCollection: boolean;
  readonly onAuthorize: () => void;
}): JSX.Element | null {
  const staleGrant = hasSelectedCollection && requiresAccessReview(error);
  if (session.status !== "authorization_required" && !staleGrant) {
    return null;
  }
  return (
    <ReaderButton disabled={working} onClick={onAuthorize}>
      {working ? "Opening mdbase…" : staleGrant ? "Review updated access" : "Authorize collection"}
    </ReaderButton>
  );
}
