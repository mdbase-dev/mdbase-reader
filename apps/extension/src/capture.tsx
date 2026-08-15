import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { tabIdParameter } from "./capture-model.js";
import "./extension.css";
import {
  STAGING_READER,
  useExtensionCapture,
  type ExtensionCaptureController,
} from "./use-extension-capture.js";

import type { ReaderConnectSnapshot } from "@mdbase-reader/connect";

function App(): React.JSX.Element {
  const controller = useExtensionCapture(tabIdParameter());
  useEffect(() => {
    document.title = controller.problem
      ? `mdbase Reader — error (${controller.progress?.phase ?? "before upload"}): ${controller.problem}`.slice(
          0,
          240,
        )
      : `mdbase Reader — ${controller.status}`;
  }, [controller.problem, controller.progress?.phase, controller.status]);
  return (
    <main className="capture-shell">
      <Header snapshot={controller.snapshot} />
      <PageCard controller={controller} />
      <CaptureReceipt controller={controller} />
      <ConnectionActions controller={controller} />
      <CollectionChoices controller={controller} />
      {controller.problem ? (
        <p className="problem" role="alert">
          {controller.problem}
        </p>
      ) : null}
      <Completion controller={controller} />
    </main>
  );
}

function Header({ snapshot }: { readonly snapshot: ReaderConnectSnapshot }): React.JSX.Element {
  const connected = snapshot.status === "ready";
  const destination = "info" in snapshot ? snapshot.info.displayName : null;
  return (
    <header>
      <span className="mark" aria-hidden="true">
        ▦
      </span>
      <strong>
        mdbase <i>reader</i>
      </strong>
      <span
        className={`connection ${connected ? "is-connected" : ""}`}
        title={destination ?? undefined}
      >
        {connected && destination ? destination : connected ? "connected" : "staging"}
      </span>
    </header>
  );
}

function PageCard({ controller }: ControllerProps): React.JSX.Element {
  return (
    <section className="page-card">
      <span className="eyebrow">CURRENT PAGE</span>
      <h1>{controller.capture?.pageTitle ?? "Reading the page…"}</h1>
      <p>
        {controller.capture
          ? new URL(controller.capture.canonicalUrl).hostname
          : "Waiting for the active tab"}
      </p>
    </section>
  );
}

function CaptureReceipt({ controller }: ControllerProps): React.JSX.Element {
  const captured = controller.status !== "opening";
  const saving = ["saving", "saved", "existing"].includes(controller.status);
  const saved = ["saved", "existing"].includes(controller.status);
  const connected = controller.snapshot.status === "ready";
  return (
    <ol className="receipt" aria-label="Capture progress">
      <ReceiptStep state={captured ? "complete" : "active"} number="01" title="Page captured">
        From the tab you opened
      </ReceiptStep>
      <ReceiptStep
        state={saving ? "complete" : captured && connected ? "active" : ""}
        number="02"
        title="Clean copy created"
      >
        Article content, not page clutter
      </ReceiptStep>
      <ReceiptStep
        state={saved ? "complete" : saving ? "active" : ""}
        number="03"
        title="Saved to mdbase"
      >
        {captureProgress(controller, connected)}
      </ReceiptStep>
    </ol>
  );
}

function captureProgress(controller: ExtensionCaptureController, connected: boolean): string {
  if (controller.progress) {
    const { phase, completedBytes, totalBytes, fileIndex, fileCount } = controller.progress;
    if (phase === "uploading") {
      const percentage = totalBytes > 0 ? Math.round((completedBytes / totalBytes) * 100) : 0;
      return `Uploading file ${fileIndex} of ${fileCount} · ${percentage}%`;
    }
    return phase === "creating" ? "Creating the Reader source record" : "Checking for duplicates";
  }
  return connected && "info" in controller.snapshot
    ? `To ${controller.snapshot.info.displayName}`
    : "Connect a collection to continue";
}

function ReceiptStep({
  state,
  number,
  title,
  children,
}: {
  readonly state: string;
  readonly number: string;
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <li className={state}>
      <span>{number}</span>
      <div>
        <strong>{title}</strong>
        <small>{children}</small>
      </div>
    </li>
  );
}

function ConnectionActions({ controller }: ControllerProps): React.JSX.Element | null {
  if (controller.snapshot.status === "ready" && controller.problem) {
    return (
      <section className="action-panel">
        <h2>Reconnect your library</h2>
        <p>Refresh this extension’s approved mdbase connection, then retry the save.</p>
        {controller.deviceCode ? (
          <p className="device-code">
            Confirm <strong>{controller.deviceCode}</strong> in mdbase Connect
          </p>
        ) : null}
        <button className="primary" type="button" onClick={() => void controller.connect()}>
          {controller.deviceCode ? "Waiting for approval…" : "Reconnect to staging"}
        </button>
      </section>
    );
  }
  if (["unselected", "authorization_required"].includes(controller.snapshot.status)) {
    return (
      <section className="action-panel">
        <h2>Connect your library</h2>
        <p>Reader uses the mdbase SDK to save directly into the collection you approve.</p>
        {controller.deviceCode ? (
          <p className="device-code">
            Confirm <strong>{controller.deviceCode}</strong> in mdbase Connect
          </p>
        ) : null}
        <button className="primary" type="button" onClick={() => void controller.connect()}>
          {controller.deviceCode ? "Waiting for approval…" : "Connect to staging"}
        </button>
      </section>
    );
  }
  if (controller.snapshot.status === "setup_review_required") {
    return (
      <section className="action-panel">
        <h2>Prepare this collection</h2>
        <p>Reader needs its source and annotation definitions before it can save this page.</p>
        <button className="primary" type="button" onClick={() => void controller.applySetup()}>
          Review and apply setup
        </button>
      </section>
    );
  }
  return null;
}

function CollectionChoices({ controller }: ControllerProps): React.JSX.Element | null {
  const snapshot = controller.snapshot;
  if (snapshot.status !== "unselected" || snapshot.connections.length === 0) {
    return null;
  }
  return (
    <section className="collection-list" aria-label="Known collections">
      {snapshot.connections.map((connection) => (
        <button
          key={connection.collectionId}
          type="button"
          onClick={() => controller.select(connection.collectionId)}
        >
          <span>{connection.displayName}</span>
          <small>Use this collection</small>
        </button>
      ))}
    </section>
  );
}

function Completion({ controller }: ControllerProps): React.JSX.Element | null {
  if (!["saved", "existing"].includes(controller.status)) {
    return null;
  }
  const openReader = (): void => {
    const url = new URL(STAGING_READER);
    if (controller.source) {
      url.searchParams.set("collection", controller.source.collectionId);
    }
    void chrome.tabs.create({ url: url.href });
  };
  const destination =
    "info" in controller.snapshot ? controller.snapshot.info.displayName : "mdbase";
  return (
    <footer className="completion">
      <div>
        <strong>
          {controller.status === "saved" ? `Saved to ${destination}` : `Already in ${destination}`}
        </strong>
        <span>{controller.source?.title}</span>
      </div>
      {controller.annotations.length ? (
        <button
          type="button"
          className="secondary"
          onClick={() => void controller.showAnnotations()}
        >
          Show {controller.annotations.length} annotation
          {controller.annotations.length === 1 ? "" : "s"} here
        </button>
      ) : null}
      {controller.renderedCount !== null ? (
        <p className="render-result">
          Displayed {controller.renderedCount} unambiguous match
          {controller.renderedCount === 1 ? "" : "es"}.
        </p>
      ) : null}
      <button className="primary" type="button" onClick={openReader}>
        Open in Reader
      </button>
      <button className="secondary" type="button" onClick={controller.changeCollection}>
        Change collection
      </button>
    </footer>
  );
}

interface ControllerProps {
  readonly controller: ExtensionCaptureController;
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Reader extension root is missing.");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
