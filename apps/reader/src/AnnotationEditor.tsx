import { ReaderButton } from "@mdbase-reader/ui";

import { annotationEditorKeys } from "./annotation-draft-actions.js";
import { MultilineCodeEditor } from "./MultilineCodeEditor.js";
import { useAnnotationEdit, type AnnotationEditProps } from "./use-annotation-edit.js";

import type { AnnotationDeletionPlan } from "@mdbase-reader/core";
import type { JSX } from "react";

export function AnnotationBodyEditor(props: AnnotationEditProps): JSX.Element {
  const {
    body,
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
          readOnly={status === "saving" || deleteStatus !== "idle"}
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
      {draft.value ? <small role="status">{draft.label}</small> : null}
      {conflict ? (
        <p role="alert">
          This annotation changed since your edit began. Copy your draft before discarding it to
          load the latest version.
        </p>
      ) : null}
      {problem || draft.problem ? <p role="alert">{problem ?? draft.problem}</p> : null}
      {deletePlan ? (
        <AnnotationDeleteConfirmation
          plan={deletePlan}
          deleting={deleteStatus === "deleting"}
          onCancel={() => setDeletePlan(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
      <div className="annotation-editor-actions">
        <button
          className="is-danger"
          type="button"
          disabled={status === "saving" || deleteStatus !== "idle" || deletePlan !== null}
          onClick={requestDelete}
        >
          {deleteStatus === "checking" ? "Checking…" : "Delete"}
        </button>
        <span />
        <button
          type="button"
          disabled={status === "saving" || deleteStatus !== "idle"}
          onClick={cancel}
        >
          Cancel
        </button>
        <ReaderButton disabled={!canSave} onClick={save}>
          {status === "saving" ? "Saving…" : "Save changes"}
        </ReaderButton>
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
