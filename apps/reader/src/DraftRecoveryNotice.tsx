import { Trans, useLingui } from "@lingui/react/macro";

import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { JSX } from "react";

export function DraftRecoveryNotice({
  workspace,
}: {
  readonly workspace: ReaderSourceWorkspaceController;
}): JSX.Element | null {
  const { t } = useLingui();
  const state = workspace.draftRecovery;
  if (!state) {
    return null;
  }
  return (
    <>
      {state.localProblem ? (
        <p className="draft-recovery is-error" role="alert">
          {state.localProblem}
        </p>
      ) : null}
      {state.conflict ? (
        <section className="draft-recovery" aria-label={t({ message: "Literature note conflict" })}>
          <strong>
            <Trans>This note changed in the collection</Trans>
          </strong>
          <p>
            <Trans>
              Your draft is retained. Compare both versions before choosing which to save. You can
              edit your draft below to combine them.
            </Trans>
          </p>
          <details>
            <summary>
              <Trans>Compare versions</Trans>
            </summary>
            <h3>
              <Trans>Your draft</Trans>
            </h3>
            <pre>{state.body}</pre>
            <h3>
              <Trans>Collection version</Trans>
            </h3>
            <pre>{state.conflict.body}</pre>
          </details>
          <div className="draft-recovery-actions">
            <button type="button" onClick={() => workspace.resolveDraftConflict?.("local")}>
              <Trans>Save my draft instead</Trans>
            </button>
            <button type="button" onClick={() => workspace.resolveDraftConflict?.("remote")}>
              <Trans>Use collection version</Trans>
            </button>
          </div>
        </section>
      ) : state.recovered ? (
        <section className="draft-recovery" role="status">
          <span>
            <Trans>Recovered changes saved on this device. Syncing to the collection…</Trans>
          </span>
        </section>
      ) : null}
    </>
  );
}
