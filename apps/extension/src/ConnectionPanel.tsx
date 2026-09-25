import { Select } from "@mdbase-reader/ui";

import { connectionUnavailableMessage } from "./connection-status.js";
import { environment } from "./environment.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

/** What the connection controls need; the panel, welcome and settings pages all provide it. */
export type ConnectionControls = Pick<
  ExtensionCaptureController,
  "snapshot" | "busy" | "deviceCode" | "connect" | "retry" | "applySetup" | "select"
>;

/** Connection states the user resolves by approving access again in mdbase Connect. */
const needsApproval = new Set(["authorization_required"]);
const needsRetry = new Set(["unavailable", "blocked", "start_failed"]);

function showAuthorization(connected: boolean, status: string): boolean {
  return (!connected && !needsRetry.has(status)) || needsApproval.has(status);
}

export function ConnectionPanel({
  controller: c,
  label = "Save to collection",
  intro = "Choose the mdbase collection to save into. Nothing is saved until you press Save.",
}: {
  readonly controller: ConnectionControls;
  readonly label?: string;
  readonly intro?: string;
}): React.JSX.Element {
  const { snapshot, busy } = c;
  const selected = "collectionId" in snapshot ? snapshot.collectionId : "";
  const connected = snapshot.connections.length > 0;
  const target = environment.label ? ` ${environment.label}` : "";
  return (
    <section className="action-panel" aria-label="Collection">
      {connected ? (
        <>
          <span className="field-label" id="collection-label">
            {label}
          </span>
          <Select
            className="collection-select"
            aria-labelledby="collection-label"
            value={selected}
            placeholder="Choose a collection"
            disabled={busy}
            options={snapshot.connections.map((connection) => ({
              value: connection.collectionId,
              label: connection.displayName,
            }))}
            onChange={(id) => c.select(id)}
          />
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => void c.connect(true)}
          >
            Connect another collection
          </button>
        </>
      ) : (
        <>
          <h2>Connect a collection</h2>
          <p>{intro}</p>
        </>
      )}
      {showAuthorization(connected, snapshot.status) ? (
        <>
          {connected ? <p>This collection needs you to approve access again.</p> : null}
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() => void c.connect()}
          >
            {busy
              ? "Connecting…"
              : connected
                ? `Reconnect to mdbase${target}`
                : `Connect to mdbase${target}`}
          </button>
        </>
      ) : null}
      {needsRetry.has(snapshot.status) ? (
        <>
          <p>{connectionUnavailableMessage(snapshot)}</p>
          <button type="button" disabled={busy} onClick={() => void c.retry()}>
            Retry connection
          </button>
        </>
      ) : null}
      {snapshot.status === "setup_review_required" ? (
        <>
          <h2>Prepare this collection</h2>
          <p>Reader needs these source and annotation definitions:</p>
          <ul>
            {snapshot.update.typePacks.map((pack) => (
              <li key={pack.id}>
                {pack.name}: {pack.currentVersion ?? "not installed"} → {pack.desiredVersion}
              </li>
            ))}
          </ul>
          <button
            className="primary"
            type="button"
            disabled={busy || !snapshot.update.canApply}
            onClick={() => void c.applySetup()}
          >
            Apply reviewed setup
          </button>
        </>
      ) : null}
      {c.deviceCode ? (
        <p className="device-code">
          Confirm <kbd>{c.deviceCode}</kbd> in mdbase Connect. Return here after approving.
        </p>
      ) : null}
    </section>
  );
}

export function ConnectionProblem({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  if (!c.problem) {
    return null;
  }
  const kind = c.problemKind ?? "connection";
  const originDenied = /origin.*not allowed|origin_denied/iu.test(c.problem);
  return (
    <section className="problem" role="alert">
      <strong>{problemTitle(c, kind)}</strong>
      {c.saveAttempted && !c.source ? (
        <p>Retry Save to check for an existing source before creating anything else.</p>
      ) : null}
      <p>{c.problem}</p>
      {originDenied ? (
        <p>
          Connect rejected this extension’s origin. Reload the current extension build and retry. If
          it persists, check the {environment.label || "mdbase"} Connect configuration; Reader will
          not bypass the origin check.
        </p>
      ) : null}
      {kind === "page" ? (
        <p>
          Reload the page, then press the mdbase Reader toolbar button again. Some pages, such as
          the Chrome Web Store and browser settings, cannot be read by extensions.
        </p>
      ) : (
        <p>
          Your selection and note are kept for this browser session, even if you close the panel.
        </p>
      )}
      <div className="problem-actions">
        {kind === "save" ? (
          <button type="button" disabled={c.busy} onClick={() => void c.save()}>
            Retry save
          </button>
        ) : null}
        {kind === "connection" ? (
          <button type="button" disabled={c.busy} onClick={() => void c.retry()}>
            Retry connection
          </button>
        ) : null}
        {kind === "save" && needsRetry.has(c.snapshot.status) ? (
          <button type="button" disabled={c.busy} onClick={() => void c.retry()}>
            Retry connection
          </button>
        ) : null}
        {kind !== "page" && !needsRetry.has(c.snapshot.status) ? (
          <button type="button" disabled={c.busy} onClick={() => void c.connect()}>
            Review access
          </button>
        ) : null}
      </div>
    </section>
  );
}

function problemTitle(
  c: ExtensionCaptureController,
  kind: NonNullable<ExtensionCaptureController["problemKind"]>,
): string {
  if (c.source) {
    return kind === "page"
      ? "Saved. This page could not be updated."
      : "Source saved. This action did not finish.";
  }
  if (c.saveAttempted) {
    return "Save not confirmed";
  }
  return kind === "page" ? "Reader cannot read this page" : "Not connected";
}
