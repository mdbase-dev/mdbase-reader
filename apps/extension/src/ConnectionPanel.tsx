import { Select } from "@mdbase-dev/ui/select";

import { connectionUnavailableMessage } from "./connection-status.js";
import { DirectAccessPanel } from "./DirectAccessPanel.js";
import { environment } from "./environment.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { ProblemKind } from "./use-action-lock.js";

/** What the connection controls need; the panel, welcome and settings pages all provide it. */
export type ConnectionControls = Pick<
  ExtensionCaptureController,
  | "snapshot"
  | "busy"
  | "deviceCode"
  | "directAccess"
  | "connect"
  | "retry"
  | "applySetup"
  | "select"
>;

/** Connection states the user resolves by approving access again in mdbase Connect. */
const needsApproval = new Set(["authorization_required"]);
const needsRetry = new Set(["unavailable", "blocked", "start_failed"]);

function showAuthorization(connected: boolean, status: string): boolean {
  return (!connected && !needsRetry.has(status)) || needsApproval.has(status);
}

export function ConnectionPanel({
  compact = false,
  expanded = false,
  onDone,
  ...props
}: ConnectionPanelProps & {
  /**
   * Once connected, show nothing: the header names the collection, and its Change button
   * sets `expanded` to show these controls until `onDone`.
   */
  readonly compact?: boolean;
  readonly expanded?: boolean;
  readonly onDone?: () => void;
}): React.JSX.Element | null {
  const { snapshot, deviceCode } = props.controller;
  const collapsible = compact && snapshot.status === "ready" && !deviceCode;
  if (collapsible && !expanded) {
    return null;
  }
  return (
    <ConnectionControlsPanel
      {...props}
      done={
        collapsible && onDone ? (
          <button
            type="button"
            className="text-button collapse-button"
            aria-expanded="true"
            onClick={onDone}
          >
            Done
          </button>
        ) : null
      }
    />
  );
}

interface ConnectionPanelProps {
  readonly controller: ConnectionControls;
  readonly label?: string;
  readonly intro?: string;
}

/** The selected collection's name, once one is connected and chosen. */
export function collectionName(controller: ConnectionControls): string | null {
  const { snapshot, deviceCode } = controller;
  if (snapshot.status !== "ready" || deviceCode) {
    return null;
  }
  return (
    snapshot.connections.find((connection) => connection.collectionId === snapshot.collectionId)
      ?.displayName ?? "your collection"
  );
}

function ConnectionControlsPanel({
  controller: c,
  label = "Save to collection",
  intro = "Choose the mdbase collection to save into. Nothing is saved until you press Save.",
  done,
}: ConnectionPanelProps & { readonly done?: React.ReactNode }): React.JSX.Element {
  const { snapshot, busy } = c;
  const selected = "collectionId" in snapshot ? snapshot.collectionId : "";
  const connected = snapshot.connections.length > 0;
  const target = environment.label ? ` ${environment.label}` : "";
  return (
    <section className="action-panel" aria-label="Collection">
      {done}
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
      {c.directAccess ? (
        <DirectAccessPanel
          key={selected}
          controller={c.directAccess}
          busy={busy}
          onUnavailable={c.retry}
        />
      ) : null}
      {c.deviceCode ? (
        <p className="device-code">
          Confirm <kbd>{c.deviceCode}</kbd> in mdbase Connect. Return here after approving.
        </p>
      ) : null}
    </section>
  );
}

/**
 * The kind of problem to report, if any. A page the tab shows but Reader cannot read is not
 * a failure: the panel says so quietly instead (see CaptureApp's UnreadablePage).
 */
function shownProblemKind(c: ExtensionCaptureController): ProblemKind | null {
  const kind = c.problemKind ?? "connection";
  return !c.problem || (kind === "page" && !c.capture) ? null : kind;
}

export function ConnectionProblem({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  const kind = shownProblemKind(c);
  if (!kind || !c.problem) {
    return null;
  }
  const originDenied = /origin.*not allowed|origin_denied/iu.test(c.problem);
  return (
    <section className="problem" role="alert">
      <strong>{problemTitle(c, kind)}</strong>
      {c.saveAttempted && !c.source ? (
        <p>Retry Save to check for an existing source before creating anything else.</p>
      ) : null}
      <p>{c.problem}</p>
      {originDenied ? (
        <details className="technical">
          <summary>Technical details</summary>
          <p>
            Connect rejected this extension’s origin. Reload the current extension build and retry.
            If it persists, check the {environment.label || "mdbase"} Connect configuration; Reader
            will not bypass the origin check.
          </p>
        </details>
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
