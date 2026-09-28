import { ConnectLayout } from "@mdbase-dev/ui/screens";
import { connectProblemMessage, type ReaderConnectSnapshot } from "@mdbase-reader/connect";
import { createReaderRuntimeServices, createWebPlatform } from "@mdbase-reader/platform";
import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from "react";

import { collectionSwitchUrl } from "./collection-switching.js";
import { CollectionSwitchingContext } from "./CollectionPicker.js";
import { ConnectWorkspaceGateway } from "./connect-workspace.js";
import { readerSession } from "./connect.js";
import { ConnectedDocument } from "./ConnectedDocument.js";
import {
  connectionProblemDetail,
  connectionStatus,
  describeConnectionProblem,
  requiresAccessReview,
  isLocalhost,
  requiresReconnect,
} from "./connection-recovery.js";
import { ConnectionRetry, SelectedAuthorizationAction } from "./ConnectionLayout.js";
import { readerErrorMessage } from "./errors.js";
import { ReaderApp } from "./ReaderApp.js";
import { requestedSourceId } from "./SourceDeepLink.js";

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
    const checkOutcome = (message: string | null): void => {
      setError(message);
      if (message) {
        throw new Error(message);
      }
    };
    return (
      <CollectionSwitchingContext
        value={{
          collectionId: session.collectionId,
          connections: session.connections,
          select: (id) => {
            history.replaceState(history.state, "", collectionSwitchUrl(location.href));
            checkOutcome(connectProblemMessage(readerSession.select(id)));
          },
          connect: async () => {
            history.replaceState(history.state, "", collectionSwitchUrl(location.href));
            checkOutcome(connectProblemMessage(await readerSession.authorize("choose")));
          },
        }}
      >
        <OpenedReader collectionId={session.collectionId} />
      </CollectionSwitchingContext>
    );
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
            opened.bodyRecovery,
          )
        : null,
    [opened],
  );
  if (!opened || !gateway) {
    return (
      <ConnectLayout
        app="reader"
        title="Open mdbase Reader"
        status="The selected collection is no longer available."
      />
    );
  }
  return (
    <ReaderApp
      key={collectionId}
      gateway={gateway}
      initialSourceId={requestedSourceId(location.href, collectionId)}
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
  // Some failures arrive only as the session's status, not as a step's error.
  const problem = error ?? connectionStatus(session);

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
    <ConnectLayout
      app="reader"
      title="Open mdbase Reader"
      status={describeConnectionProblem(connectionStatus(session))}
      error={describeConnectionProblem(error)}
      detail={connectionProblemDetail(problem)}
    >
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
        <SelectedAuthorizationAction
          session={session}
          error={problem}
          working={working}
          hasSelectedCollection={Boolean(selectedCollectionId)}
          onAuthorize={() => void authorize("selected")}
        />
        {requiresReconnect(problem) || requiresAccessReview(problem) ? null : (
          <ConnectionRetry error={error} onRetry={onRetry} />
        )}
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
    </ConnectLayout>
  );
}
