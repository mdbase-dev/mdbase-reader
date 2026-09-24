import { environment } from "./environment.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

export function ConnectionPanel({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element {
  const { snapshot, busy } = c;
  const selected = "collectionId" in snapshot ? snapshot.collectionId : "";
  return (
    <section className="action-panel" aria-label="Save destination">
      <label htmlFor="collection">Save to collection</label>
      <select
        id="collection"
        value={selected}
        disabled={busy}
        onChange={(event) => c.select(event.target.value)}
      >
        <option value="" disabled>
          Choose a collection
        </option>
        {snapshot.connections.map((connection) => (
          <option key={connection.collectionId} value={connection.collectionId}>
            {connection.displayName}
          </option>
        ))}
      </select>
      <button
        className="text-button"
        type="button"
        disabled={busy}
        onClick={() => void c.connect(true)}
      >
        Connect another collection
      </button>
      {snapshot.status !== "ready" && snapshot.status !== "setup_review_required" ? (
        <>
          <p>Approve a collection in mdbase Connect. Nothing is saved until you press Save.</p>
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() => void c.connect()}
          >
            {busy
              ? "Connecting…"
              : `Connect to mdbase${environment.label ? ` ${environment.label}` : ""}`}
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
          Confirm <strong>{c.deviceCode}</strong> in mdbase Connect. Return here after approving.
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
  const originDenied = /origin.*not allowed|origin_denied/iu.test(c.problem);
  return (
    <section className="problem" role="alert">
      <strong>
        {c.source
          ? "Source saved. This action did not finish."
          : c.saveAttempted
            ? "Save not confirmed"
            : "Not saved"}
      </strong>
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
      <p>Your selection and note are kept for this browser session, even if you close the panel.</p>
      <button type="button" disabled={c.busy} onClick={() => void c.retry()}>
        Retry connection
      </button>{" "}
      <button type="button" disabled={c.busy} onClick={() => void c.connect()}>
        Review access
      </button>
    </section>
  );
}
