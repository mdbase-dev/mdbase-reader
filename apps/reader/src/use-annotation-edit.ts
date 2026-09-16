import { useState } from "react";

import { confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import {
  annotationDraftKey,
  annotationDraftSnapshot,
  saveAnnotationDraft,
} from "./annotation-drafts.js";
import { readerErrorMessage } from "./errors.js";
import { useAnnotationDraft } from "./use-annotation-draft.js";

import type { Annotation, AnnotationDeletionPlan } from "@mdbase-reader/core";
export interface AnnotationEditProps {
  readonly annotation: Annotation;
  readonly onCancel: () => void;
  readonly onSave: (body: string) => Promise<void>;
  readonly onPlanDelete: () => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (plan: AnnotationDeletionPlan) => Promise<void>;
}
interface AnnotationEditController {
  readonly body: string;
  readonly canSave: boolean;
  readonly draft: ReturnType<typeof useAnnotationDraft>;
  readonly conflict: boolean;
  readonly status: "idle" | "saving";
  readonly deleteStatus: "idle" | "checking" | "deleting";
  readonly problem: string | null;
  readonly deletePlan: AnnotationDeletionPlan | null;
  readonly setDeletePlan: (plan: AnnotationDeletionPlan | null) => void;
  readonly setBody: (value: string) => void;
  readonly cancel: () => void;
  readonly save: () => void;
  readonly requestDelete: () => void;
  readonly confirmDelete: () => void;
}
export function useAnnotationEdit({
  annotation,
  onCancel,
  onSave,
  onPlanDelete,
  onDelete,
}: AnnotationEditProps): AnnotationEditController {
  const draftKey = annotationDraftKey(annotation.collectionId, annotation.sourceId, annotation.id);
  const draft = useAnnotationDraft(draftKey);
  const body = draft.value?.body ?? annotation.body;
  const conflict = Boolean(
    draft.value && draft.value.baseBody !== annotation.body && body !== annotation.body,
  );
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [deletePlan, setDeletePlan] = useState<AnnotationDeletionPlan | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "checking" | "deleting">("idle");
  const setBody = (value: string): void =>
    draft.set(
      value === annotation.body
        ? null
        : { body: value, baseBody: draft.value?.baseBody ?? annotation.body },
    );
  const cancel = (): void => {
    if (status !== "idle" || deleteStatus !== "idle") {
      return;
    }
    if (
      body !== annotation.body &&
      !confirmAnnotationDiscard("Discard your unfinished annotation edit?")
    ) {
      return;
    }
    draft.set(null);
    onCancel();
  };
  const canSave =
    draft.ready &&
    !conflict &&
    status === "idle" &&
    deleteStatus === "idle" &&
    deletePlan === null &&
    body !== annotation.body;
  const save = (): void => {
    if (!canSave) {
      return;
    }
    setStatus("saving");
    setProblem(null);
    void onSave(body)
      .then(() => {
        const latest = annotationDraftSnapshot(draftKey).value;
        if (latest?.body === body) {
          saveAnnotationDraft(draftKey, null);
          onCancel();
        } else if (latest) {
          saveAnnotationDraft(draftKey, { ...latest, baseBody: body });
        }
        setStatus("idle");
      })
      .catch((reason: unknown) => {
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
    void onDelete(deletePlan)
      .then(() => saveAnnotationDraft(draftKey, null))
      .catch((reason: unknown) => {
        setProblem(readerErrorMessage(reason, "Reader could not delete this annotation."));
        setDeleteStatus("idle");
        setDeletePlan(null);
      });
  };
  return {
    canSave,
    body,
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
  };
}
