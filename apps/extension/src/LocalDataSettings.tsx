import { useState } from "react";

import { requestLocalReset } from "./local-reset.js";

export function LocalDataSettings(): React.JSX.Element {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reset = (): void => {
    setBusy(true);
    void requestLocalReset().catch(() => {
      setBusy(false);
      setProblem("Could not start local cleanup. Nothing has been confirmed cleared; try again.");
    });
  };
  return (
    <section aria-labelledby="local-data-heading">
      <h2 id="local-data-heading">Disconnect this browser</h2>
      <p>
        Clears this extension’s local authorizations, signing keys, preferences and drafts, and
        removes optional website and local-connector permissions. You will need to connect again.
        Other browsers and saved collection records and files are not deleted.
      </p>
      <p>
        This forgets local access; it does not revoke authorization at mdbase Connect. Manage
        server-side access separately in Connect. Existing marks on open pages may remain until you
        reload those pages.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        I have finished saving. Discard unsaved drafts and pending-write recovery information.
      </label>
      <p className="hint">
        Wait for saves to finish first. A write already sent may still complete; clearing recovery
        information cannot undo it. Reader will restart to stop active connections before cleanup.
      </p>
      <button type="button" disabled={!confirmed || busy} onClick={reset}>
        {busy ? "Restarting Reader…" : "Disconnect and clear local data"}
      </button>
      {problem ? <p role="alert">{problem}</p> : null}
    </section>
  );
}
