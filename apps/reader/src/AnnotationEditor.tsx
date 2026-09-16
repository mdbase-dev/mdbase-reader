import { ReaderButton } from "@mdbase-reader/ui";

import { annotationEditorKeys } from "./annotation-draft-actions.js";
import { MultilineCodeEditor } from "./MultilineCodeEditor.js";
import { useAnnotationEdit, type AnnotationEditProps } from "./use-annotation-edit.js";

import type { AnnotationDeletionPlan } from "@mdbase-reader/core";
import type { JSX } from "react";

export function AnnotationBodyEditor(props: AnnotationEditProps): JSX.Element {
  const {
    body,
    session,
    locked,
    canSave,
    draft,
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
  return (
    // Delegate shortcuts from buttons and editors without stealing completion-menu keys.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="annotation-body-editor"
      role="group"
      aria-label="Edit annotation"
      onKeyDown={(event) => annotationEditorKeys(event, cancel, save)}
    >
      <div className="annotation-editor-label">Quotation and comment</div>
      {draft.ready ? (
        <MultilineCodeEditor
          value={body}
          readOnly={locked}
          sharedDocument={session}
          ariaLabel="Annotation note"
          className="annotation-code-editor"
          focusOnMount
          onChange={setBody}
          onSave={save}
        />
      ) : (
        <p role="status">Checking for a saved draft…</p>
      )}
      <span>
        Edit the Markdown quotation and comment. The saved passage anchor stays unchanged.
      </span>
      <small role="status">
        {status === "saved"
          ? "Saved to collection"
          : status === "saving"
            ? "Saving to collection…"
            : draft.saved
              ? "Saved on this device"
              : "Saving on this device…"}
      </small>
      {conflict ? (
        <section role="alert">
          <p>This annotation changed in the collection. Your changes are retained.</p>
          <details>
            <summary>Compare collection version</summary>
            <pre>{conflict.body}</pre>
          </details>
          <button type="button" disabled={locked} onClick={() => session.resolve("local")}>
            Keep my changes
          </button>
          <button type="button" disabled={locked} onClick={() => session.resolve("remote")}>
            Use collection version
          </button>
        </section>
      ) : null}
      {problem || draft.problem ? <p role="alert">{problem ?? draft.problem}</p> : null}
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
          disabled={locked || !draft.ready || deletePlan !== null}
          onClick={requestDelete}
        >
          {deleteStatus === "checking" ? "Checking…" : "Delete"}
        </button>
        <span />
        <button type="button" disabled={locked} onClick={cancel}>
          Done
        </button>
        {status === "error" && !conflict ? (
          <ReaderButton disabled={!canSave} onClick={save}>
            Retry save
          </ReaderButton>
        ) : null}
      </div>
    </div>
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
