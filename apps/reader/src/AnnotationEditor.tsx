import { ReaderButton } from "@mdbase-reader/ui";

import { annotationEditorKeys } from "./annotation-draft-actions.js";
import { AnnotationTextArea } from "./AnnotationTextArea.js";
import { useAnnotationEdit, type AnnotationEditProps } from "./use-annotation-edit.js";

import type { AnnotationDeletionPlan } from "@mdbase-reader/core";
import type { JSX } from "react";

export function AnnotationBodyEditor(props: AnnotationEditProps): JSX.Element {
  const {
    body,
    locked,
    editingElsewhere,
    claimEditor,
    discard,
    resolve,
    canSave,
    conflict,
    setBody,
    cancel,
    status,
    problem,
    deletePlan,
    setDeletePlan,
    deleteStatus,
    save,
    requestDelete,
    confirmDelete,
  } = useAnnotationEdit(props);
  const busy = locked || status === "saving";
  if (editingElsewhere) {
    return (
      <div className="annotation-body-editor" role="group" aria-label="Edit annotation">
        <p>Only one pane edits this annotation at a time. Other panes show the saved version.</p>
        <button type="button" disabled={locked} onClick={claimEditor}>
          Edit here
        </button>
        <button type="button" onClick={cancel}>
          Close
        </button>
      </div>
    );
  }
  return (
    // Delegate explicit save/close shortcuts from interactive children.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="annotation-body-editor"
      role="group"
      aria-label="Edit annotation"
      onKeyDown={(event) => annotationEditorKeys(event, cancel, save)}
    >
      <div className="annotation-editor-label">Quotation and comment</div>
      {status !== "loading" ? (
        <AnnotationTextArea value={body} readOnly={locked} onChange={setBody} />
      ) : (
        <p role="status">Loading annotation…</p>
      )}
      <span>
        Saves after a one-second pause. Keep Reader open until saved. Markdown is supported.
      </span>
      <AnnotationSaveState status={status} />
      {conflict ? (
        <section role="alert">
          <p>This annotation changed in the collection. Your changes are retained.</p>
          <details>
            <summary>Compare collection version</summary>
            <pre>{conflict.body}</pre>
          </details>
          <button type="button" disabled={busy} onClick={() => resolve("local")}>
            Keep my changes
          </button>
          <button type="button" disabled={busy} onClick={() => resolve("remote")}>
            Use collection version
          </button>
        </section>
      ) : null}
      {problem ? <p role="alert">{problem}</p> : null}
      {deletePlan ? (
        <AnnotationDeleteConfirmation
          plan={deletePlan}
          deleting={deleteStatus === "deleting"}
          onCancel={setDeletePlan}
          onConfirm={confirmDelete}
        />
      ) : null}
      <div className="annotation-editor-actions">
        <button
          className="is-danger"
          type="button"
          disabled={locked || status === "loading" || deletePlan !== null}
          onClick={requestDelete}
        >
          {deleteStatus === "checking" ? "Checking…" : "Delete"}
        </button>
        <span />
        {status !== "saved" ? (
          <button type="button" disabled={busy} onClick={discard}>
            Discard changes
          </button>
        ) : null}
        <button type="button" disabled={locked} onClick={cancel}>
          Close
        </button>
        <ReaderButton disabled={!canSave} onClick={save}>
          {status === "saving"
            ? "Saving…"
            : status === "error" && !conflict
              ? "Retry save"
              : "Done"}
        </ReaderButton>
      </div>
    </div>
  );
}

function AnnotationSaveState({ status }: { readonly status: string }): JSX.Element {
  return (
    <small role="status">
      {status === "saved"
        ? "Saved to collection"
        : status === "saving"
          ? "Saving to collection…"
          : "Unsaved changes — only in memory"}
    </small>
  );
}

function AnnotationDeleteConfirmation({
  plan,
  deleting,
  onCancel,
  onConfirm,
}: {
  readonly plan: AnnotationDeletionPlan;
  readonly deleting: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): JSX.Element {
  return (
    <section className="annotation-delete-confirmation" aria-labelledby="annotation-delete-title">
      <strong id="annotation-delete-title">Delete this annotation?</strong>
      {plan.brokenLinkPaths.length > 0 ? (
        <>
          <p>The following notes will retain visible, broken embeds:</p>
          <ul>
            {plan.brokenLinkPaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>No inbound links or embeds were found.</p>
      )}
      <div>
        <button type="button" disabled={deleting} onClick={onCancel}>
          Keep annotation
        </button>
        <button className="is-danger" type="button" disabled={deleting} onClick={onConfirm}>
          {deleting ? "Deleting…" : "Delete record"}
        </button>
      </div>
    </section>
  );
}
