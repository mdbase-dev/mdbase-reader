import { connectProblemMessage, type ReaderConnectSnapshot } from "@mdbase-reader/connect";
import { createReaderRuntimeServices, createWebPlatform } from "@mdbase-reader/platform";
import { ProductBrand, ReaderButton } from "@mdbase-reader/ui";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from "react";

import { ConnectWorkspaceGateway } from "./connect-workspace.js";
import { readerSession } from "./connect.js";
import { ConnectedDocument } from "./ConnectedDocument.js";
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
          )
        : null,
    [opened],
  );
  if (!opened || !gateway) {
    return <ConnectionLayout status="The selected collection is no longer available." />;
  }
  return (
    <ReaderApp
      gateway={gateway}
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
    const outcome = await readerSession.authorize(target);
    onError(connectProblemMessage(outcome));
    setWorking(false);
  };
  const applySetup = async (): Promise<void> => {
    setWorking(true);
    onError(null);
    const outcome = await readerSession.applyCollectionSetup();
    onError(connectProblemMessage(outcome));
    setWorking(false);
  };
  const select = (collectionId: string): void => {
    onError(connectProblemMessage(readerSession.select(collectionId)));
  };

  let status = "Choose a collection to open in Reader.";
  if (session.status === "opening") {
    status = "Finding mdbase Connect…";
  } else if (session.status === "authorization_required") {
    status = "Reader needs your approval to open this collection.";
  } else if (session.status === "checking_setup") {
    status = "Checking the collection’s Reader contracts…";
  } else if (session.status === "unavailable") {
    status = `This collection is ${session.reason.replaceAll("_", " ")}.`;
  } else if (session.status === "blocked") {
    status = session.problem.message;
  } else if (session.status === "setup_review_required") {
    status = "Review the Reader definitions before they are installed.";
  }

  return (
    <ConnectionLayout status={status} error={error}>
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
        {session.status === "authorization_required" ? (
          <ReaderButton disabled={working} onClick={() => void authorize("selected")}>
            {working ? "Opening mdbase…" : "Authorize this collection"}
          </ReaderButton>
        ) : null}
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

function ConnectionRetry({
  error,
  onRetry,
}: {
  readonly error: string | null;
  readonly onRetry: () => void;
}): JSX.Element | null {
  return error ? <ReaderButton onClick={onRetry}>Try again</ReaderButton> : null;
}

function ConnectionLayout({
  status,
  error,
  children,
}: {
  readonly status: string;
  readonly error?: string | null;
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <main className="connection-screen">
      <section className="connection-card">
        <ProductBrand />
        <div className="connection-copy">
          <span className="mono">Your library, directly</span>
          <h1>Open mdbase Reader</h1>
          <p role="status">{status}</p>
          {error ? (
            <p className="connection-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {children}
      </section>
    </main>
  );
}

function isLocalhost(current: Location): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(current.hostname);
}
