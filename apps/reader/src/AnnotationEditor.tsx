import { ReaderButton } from "@mdbase-reader/ui";
import { useState, type JSX } from "react";

import { readerErrorMessage } from "./errors.js";
import { MultilineCodeEditor } from "./MultilineCodeEditor.js";

import type { Annotation, AnnotationDeletionPlan } from "@mdbase-reader/core";

export function AnnotationBodyEditor({
  annotation,
  onCancel,
  onSave,
  onPlanDelete,
  onDelete,
}: {
  readonly annotation: Annotation;
  readonly onCancel: () => void;
  readonly onSave: (body: string) => Promise<void>;
  readonly onPlanDelete: () => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (plan: AnnotationDeletionPlan) => Promise<void>;
}): JSX.Element {
  const [body, setBody] = useState(annotation.body);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [deletePlan, setDeletePlan] = useState<AnnotationDeletionPlan | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "checking" | "deleting">("idle");
  const save = (): void => {
    if (status === "saving" || body === annotation.body) {
      return;
    }
    setStatus("saving");
    setProblem(null);
    void onSave(body).catch((reason: unknown) => {
      setProblem(readerErrorMessage(reason, "Reader could not update this annotation."));
      setStatus("idle");
    });
  };
  const requestDelete = (): void => {
    if (deleteStatus !== "idle") {
      return;
    }
    setDeleteStatus("checking");
    setProblem(null);
    void onPlanDelete()
      .then((plan) => {
        setDeletePlan(plan);
        setDeleteStatus("idle");
      })
      .catch((reason: unknown) => {
        setProblem(readerErrorMessage(reason, "Reader could not check this annotation."));
        setDeleteStatus("idle");
      });
  };
  const confirmDelete = (): void => {
    if (!deletePlan || deleteStatus !== "idle") {
      return;
    }
    setDeleteStatus("deleting");
    setProblem(null);
    void onDelete(deletePlan).catch((reason: unknown) => {
      setProblem(readerErrorMessage(reason, "Reader could not delete this annotation."));
      setDeleteStatus("idle");
      setDeletePlan(null);
    });
  };
  return (
    <div className="annotation-body-editor">
      <div className="annotation-editor-label">Annotation Markdown</div>
      <MultilineCodeEditor
        value={body}
        ariaLabel="Annotation Markdown"
        className="annotation-code-editor"
        onChange={setBody}
      />
      <span>Captured selector evidence stays unchanged.</span>
      {problem ? <p role="alert">{problem}</p> : null}
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
        <button type="button" disabled={status === "saving"} onClick={onCancel}>
          Cancel
        </button>
        <ReaderButton disabled={status === "saving" || body === annotation.body} onClick={save}>
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
