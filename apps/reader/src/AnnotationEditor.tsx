import { ReaderButton } from "@mdbase-reader/ui";
import { useState } from "react";

import {
  annotationBodyFields,
  annotationBodyWithFields,
  type AnnotationBodyFields,
} from "./annotation-body-fields.js";
import { annotationEditorKeys } from "./annotation-draft-actions.js";
import { AnnotationTextArea } from "./AnnotationTextArea.js";
import { useAnnotationEdit, type AnnotationEditProps } from "./use-annotation-edit.js";

import type { AnnotationDeletionPlan } from "@mdbase-reader/core";
import type { JSX } from "react";

export function AnnotationBodyEditor(props: AnnotationEditProps): JSX.Element {
  const edit = useAnnotationEdit(props);
  const { locked, status, conflict, deletePlan, deleteStatus } = edit;
  const busy = locked || status === "saving";
  const failed = status === "error" && !conflict;
  if (edit.editingElsewhere) {
    return (
      <div className="annotation-body-editor" role="group" aria-label="Edit annotation">
        <p>Being edited in another pane.</p>
        <div className="annotation-editor-actions">
          <span />
          <button type="button" onClick={edit.cancel}>
            Close
          </button>
          <button type="button" disabled={locked} onClick={edit.claimEditor}>
            Edit here
          </button>
        </div>
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
      onKeyDown={(event) => annotationEditorKeys(event, edit.cancel, edit.save)}
    >
      {status !== "loading" ? (
        <AnnotationFieldsEditor
          body={edit.body}
          selectedText={props.annotation.target?.quote?.exact}
          readOnly={locked}
          onChange={edit.setBody}
        />
      ) : (
        <p role="status">Loading…</p>
      )}
      {conflict ? (
        <section role="alert">
          <p>This annotation changed elsewhere. Your version is kept until you choose.</p>
          <details>
            <summary>Compare collection version</summary>
            <pre>{conflict.body}</pre>
          </details>
          <button type="button" disabled={busy} onClick={() => edit.resolve("local")}>
            Keep mine
          </button>
          <button type="button" disabled={busy} onClick={() => edit.resolve("remote")}>
            Use theirs
          </button>
        </section>
      ) : null}
      {edit.problem ? <p role="alert">{edit.problem}</p> : null}
      {deletePlan ? (
        <AnnotationDeleteConfirmation
          plan={deletePlan}
          deleting={deleteStatus === "deleting"}
          onCancel={edit.setDeletePlan}
          onConfirm={edit.confirmDelete}
        />
      ) : (
        <AnnotationEditorActions edit={edit} failed={failed} />
      )}
    </div>
  );
}

function AnnotationEditorActions({
  edit,
  failed,
}: {
  readonly edit: ReturnType<typeof useAnnotationEdit>;
  readonly failed: boolean;
}): JSX.Element {
  const { locked, status, deleteStatus } = edit;
  const busy = locked || status === "saving";
  return (
    <div className="annotation-editor-actions">
      <button
        className="is-danger"
        type="button"
        disabled={locked || status === "loading"}
        onClick={edit.requestDelete}
      >
        {deleteStatus === "checking" ? "Checking…" : "Delete"}
      </button>
      <AnnotationSaveState status={failed ? "failed" : status} />
      {status === "unsaved" || status === "error" ? (
        <button type="button" className="annotation-discard" disabled={busy} onClick={edit.discard}>
          Discard changes
        </button>
      ) : null}
      <ReaderButton disabled={!edit.canSave} onClick={edit.save}>
        {status === "saving" ? "Saving…" : failed ? "Retry save" : "Done"}
      </ReaderButton>
    </div>
  );
}

/**
 * The quotation and comment as separate plain-text fields. Field values are kept locally so
 * typing (trailing newlines included) is never reshaped; each change rebuilds the body.
 */
function AnnotationFieldsEditor({
  body,
  selectedText,
  readOnly,
  onChange,
}: {
  readonly body: string;
  readonly selectedText: string | undefined;
  readonly readOnly: boolean;
  readonly onChange: (body: string) => void;
}): JSX.Element {
  const [state, setState] = useState(() => ({
    body,
    fields: annotationBodyFields(body, selectedText),
  }));
  // A discarded draft, a chosen conflict version or another pane's edit replaces the body.
  const fields: AnnotationBodyFields =
    state.body === body ? state.fields : annotationBodyFields(body, selectedText);
  const change = (next: Pick<AnnotationBodyFields, "quote" | "comment">): void => {
    const nextBody = fields.structured
      ? annotationBodyWithFields(body, next, selectedText)
      : next.comment;
    setState({ body: nextBody, fields: { ...fields, ...next } });
    onChange(nextBody);
  };
  if (!fields.structured) {
    return (
      <AnnotationTextArea
        value={fields.comment}
        readOnly={readOnly}
        label="Annotation Markdown"
        onChange={(comment) => change({ quote: null, comment })}
      />
    );
  }
  const quote = fields.quote;
  return (
    <>
      {quote !== null ? (
        <div className="annotation-quote-field">
          <AnnotationTextArea
            className="is-quote"
            value={quote}
            readOnly={readOnly}
            label="Quoted passage"
            rows={1}
            focusOnMount={false}
            autoSize
            onChange={(value) => change({ quote: value, comment: fields.comment })}
          />
          {selectedText !== undefined && quote !== selectedText ? (
            <small>
              Edited from the document text.{" "}
              <button
                type="button"
                disabled={readOnly}
                onClick={() => change({ quote: selectedText, comment: fields.comment })}
              >
                Restore
              </button>
            </small>
          ) : null}
        </div>
      ) : null}
      <AnnotationTextArea
        value={fields.comment}
        readOnly={readOnly}
        placeholder="Add a comment…"
        rows={3}
        autoSize
        onChange={(comment) => change({ quote, comment })}
      />
    </>
  );
}

const saveStateLabels: Readonly<Record<string, string>> = {
  failed: "Not saved",
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved",
};

function AnnotationSaveState({ status }: { readonly status: string }): JSX.Element {
  return (
    <small className={`annotation-save-state is-${status}`} role="status">
      {saveStateLabels[status] ?? ""}
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
          <p>These notes embed it and will show a broken embed:</p>
          <ul>
            {plan.brokenLinkPaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </>
      ) : null}
      <div>
        <button type="button" disabled={deleting} onClick={onCancel}>
          Cancel
        </button>
        <button className="is-danger" type="button" disabled={deleting} onClick={onConfirm}>
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </section>
  );
}
