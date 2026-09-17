import { useEffect, useMemo, useState } from "react";

import { AnnotationDeletionLease } from "./annotation-deletion-lease.js";
import { readerErrorMessage } from "./errors.js";

import type { AnnotationEditSession } from "./annotation-edit-session.js";
import type { Annotation, AnnotationDeletionPlan } from "@mdbase-reader/core";

interface DeletionActions {
  readonly onPlanDelete: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (annotation: Annotation, plan: AnnotationDeletionPlan) => Promise<void>;
  readonly onCancel: () => void;
}
interface DeletionController {
  readonly problem: string | null;
  readonly deletePlan: AnnotationDeletionPlan | null;
  readonly deleteStatus: "idle" | "checking" | "deleting";
  readonly setDeletePlan: () => void;
  readonly requestDelete: () => void;
  readonly confirmDelete: () => void;
  readonly isMounted: () => boolean;
}
export function useAnnotationDeletion(
  session: AnnotationEditSession,
  { onPlanDelete, onDelete, onCancel }: DeletionActions,
  enabled: boolean,
): DeletionController {
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
    if (!enabled) {
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
  return {
    problem,
    deletePlan,
    deleteStatus,
    setDeletePlan: cancelDelete,
    requestDelete,
    confirmDelete,
    isMounted: () => owner.isMounted(),
  };
}
