import { ConnectionPanel } from "./ConnectionPanel.js";

import type { CollectionConnection } from "./use-collection-connection.js";

/** Connection controls for a full-page view, with its own recovery. */
export function CollectionSection({
  connection: c,
  label,
}: {
  readonly connection: CollectionConnection;
  readonly label: string;
}): React.JSX.Element {
  return (
    <>
      <ConnectionPanel
        controller={c}
        label={label}
        intro="Choose the mdbase collection that pages and highlights are saved into."
      />
      {c.snapshot.status === "ready" ? (
        <p className="connected-note">Connected. The panel saves here unless you choose another.</p>
      ) : null}
      {c.problem ? (
        <div className="problem" role="alert">
          <p>{c.problem}</p>
          <div className="problem-actions">
            <button type="button" disabled={c.busy} onClick={() => void c.retry()}>
              Retry connection
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
