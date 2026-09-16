import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AnnotationDeletionLease } from "./annotation-deletion-lease.js";
import { readerErrorMessage } from "./errors.js";
import { useAnnotationDraft } from "./use-annotation-draft.js";
import { useAnnotationSession } from "./use-annotation-session.js";

import type {
  AnnotationEditSession,
  AnnotationEditSnapshot,
  PersistAnnotation,
} from "./annotation-edit-session.js";
import type { Annotation, AnnotationDeletionPlan } from "@mdbase-reader/core";
export interface AnnotationEditProps {
  readonly annotation: Annotation;
  readonly onCancel: () => void;
  readonly onSave: PersistAnnotation;
  readonly onPlanDelete: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (annotation: Annotation, plan: AnnotationDeletionPlan) => Promise<void>;
}
interface AnnotationEditController {
  readonly body: string;
  readonly draft: ReturnType<typeof useAnnotationDraft>;
  readonly session: AnnotationEditSession;
  readonly conflict: Annotation | null;
  readonly status: AnnotationEditSnapshot["status"];
  readonly locked: boolean;
  readonly problem: string | null;
  readonly canSave: boolean;
  readonly setBody: (body: string) => void;
  readonly save: () => void;
  readonly cancel: () => void;
  readonly deletePlan: AnnotationDeletionPlan | null;
  readonly setDeletePlan: () => void;
  readonly deleteStatus: "idle" | "checking" | "deleting";
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
  const session = useAnnotationSession(annotation, onSave);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const draft = useAnnotationDraft(session.key);
  const [problem, setProblem] = useState<string | null>(null);
  const [deletePlan, setDeletePlan] = useState<AnnotationDeletionPlan | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "checking" | "deleting">("idle");
  const owner = useMemo(() => new AnnotationDeletionLease(session), [session]);
  useEffect(() => owner.attach(), [owner]);
  const cancelDelete = (): void => {
    setDeletePlan(null);
    owner.release();
  };
  const requestDelete = (): void => {
    if (snapshot.locked || !draft.ready) {
      return;
    }
    setDeleteStatus("checking");
    setProblem(null);
    void owner
      .acquire()
      .then(async (locked) => {
        if (!locked) {
          throw new Error(
            "Resolve the save problem or finish the other editor's deletion check first.",
          );
        }
        if (!owner.isMounted()) {
          owner.release();
          return;
        }
        const plan = await onPlanDelete(session.getAnnotation());
        if (owner.isMounted()) {
          setDeletePlan(plan);
          setDeleteStatus("idle");
        } else {
          owner.release();
        }
      })
      .catch((reason: unknown) => {
        owner.release();
        if (owner.isMounted()) {
          setProblem(readerErrorMessage(reason, "Could not check this annotation."));
          setDeleteStatus("idle");
        }
      });
  };
  const confirmDelete = (): void => {
    if (!deletePlan || deleteStatus !== "idle") {
      return;
    }
    owner.commit();
    setDeleteStatus("deleting");
    void onDelete(session.getAnnotation(), deletePlan)
      .then(() => {
        session.deleted();
        if (owner.isMounted()) {
          onCancel();
        }
      })
      .catch((reason: unknown) => {
        owner.release();
        if (owner.isMounted()) {
          setProblem(readerErrorMessage(reason, "Could not delete this annotation."));
          setDeleteStatus("idle");
          setDeletePlan(null);
        }
      });
  };
  const cancel = (): void => {
    if (snapshot.locked) {
      return;
    }
    // Closing this editor never discards the shared draft or cancels its autosave.
    onCancel();
  };
  return {
    body: snapshot.body,
    draft,
    session,
    conflict: snapshot.conflict,
    status: snapshot.status,
    locked: snapshot.locked,
    problem: problem ?? snapshot.problem,
    canSave:
      draft.ready &&
      !snapshot.locked &&
      !snapshot.conflict &&
      snapshot.status !== "saving" &&
      snapshot.status !== "saved",
    setBody: session.edit,
    save: () => {
      void session.save();
    },
    cancel,
    deletePlan,
    setDeletePlan: cancelDelete,
    deleteStatus,
    requestDelete,
    confirmDelete,
  };
}
