import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { JSX } from "react";

export function DraftRecoveryNotice({
  workspace,
}: {
  readonly workspace: ReaderSourceWorkspaceController;
}): JSX.Element | null {
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
        <section className="draft-recovery" aria-label="Source note conflict">
          <strong>This note changed in the collection</strong>
          <p>
            Your draft is retained. Compare both versions before choosing which to save. You can
            edit your draft below to combine them.
          </p>
          <details>
            <summary>Compare versions</summary>
            <h3>Your draft</h3>
            <pre>{state.body}</pre>
            <h3>Collection version</h3>
            <pre>{state.conflict.body}</pre>
          </details>
          <div className="draft-recovery-actions">
            <button type="button" onClick={() => workspace.resolveDraftConflict?.("local")}>
              Save my draft instead
            </button>
            <button type="button" onClick={() => workspace.resolveDraftConflict?.("remote")}>
              Use collection version
            </button>
          </div>
        </section>
      ) : state.recovered ? (
        <section className="draft-recovery" role="status">
          <strong>Recovered a local draft</strong>
          <p>Review your changes below. They have not been written to the collection.</p>
          <button type="button" onClick={workspace.saveDraft}>
            Save recovered draft
          </button>
        </section>
      ) : null}
    </>
  );
}
