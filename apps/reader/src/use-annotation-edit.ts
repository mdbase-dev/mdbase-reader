import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import { useAnnotationDeletion } from "./use-annotation-deletion.js";
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
  readonly session: AnnotationEditSession;
  readonly conflict: Annotation | null;
  readonly status: AnnotationEditSnapshot["status"];
  readonly locked: boolean;
  readonly problem: string | null;
  readonly canSave: boolean;
  readonly setBody: (body: string) => void;
  readonly save: () => void;
  readonly cancel: () => void;
  readonly discard: () => void;
  readonly resolve: (choice: "local" | "remote") => void;
  readonly editingElsewhere: boolean;
  readonly claimEditor: () => void;
  readonly deletePlan: AnnotationDeletionPlan | null;
  readonly setDeletePlan: () => void;
  readonly deleteStatus: "idle" | "checking" | "deleting";
  readonly requestDelete: () => void;
  readonly confirmDelete: () => void;
}
export function useAnnotationEdit(props: AnnotationEditProps): AnnotationEditController {
  const { annotation, onCancel, onSave } = props;
  const session = useAnnotationSession(annotation, onSave);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const ready = snapshot.status !== "loading";
  const editorOwner = useMemo(() => ({ session }), [session]);
  useEffect(() => {
    session.claimEditor(editorOwner, true);
    return () => session.releaseEditor(editorOwner);
  }, [session, editorOwner]);
  const [text, setText] = useState(() => ({
    version: snapshot.textVersion,
    body: session.getText(),
  }));
  const body = text.version === snapshot.textVersion ? text.body : session.getText();
  const editingElsewhere = !session.ownsEditor(editorOwner);
  const locked = snapshot.locked;
  const deletion = useAnnotationDeletion(session, props, !locked && !editingElsewhere && ready);
  const cancel = (): void => {
    if (locked) {
      return;
    }
    if (
      session.getSnapshot().status !== "saved" &&
      !confirmAnnotationDiscard(
        "Close with unsaved changes? Saving may continue in this window, but reloading Reader before it finishes will lose them.",
      )
    ) {
      return;
    }
    onCancel();
  };
  const save = (): void => {
    if (locked || !session.ownsEditor(editorOwner) || !ready) {
      return;
    }
    void session.save().then(() => {
      if (session.getSnapshot().status === "saved" && deletion.isMounted()) {
        onCancel();
      }
    });
  };
  return {
    ...deletion,
    body,
    session,
    conflict: snapshot.conflict,
    status: snapshot.status,
    locked,
    problem: deletion.problem ?? snapshot.problem,
    canSave:
      ready && !locked && !editingElsewhere && !snapshot.conflict && snapshot.status !== "saving",
    setBody: (value) => {
      if (locked || !session.ownsEditor(editorOwner)) {
        return;
      }
      session.edit(value);
      setText({ version: snapshot.textVersion, body: session.getText() });
    },
    save,
    cancel,
    editingElsewhere,
    claimEditor: () => {
      session.claimEditor(editorOwner, true);
    },
    discard: () => {
      if (
        !locked &&
        snapshot.status !== "saving" &&
        session.ownsEditor(editorOwner) &&
        confirmAnnotationDiscard(
          "Discard this annotation's unsaved changes? The collection version will be kept.",
        )
      ) {
        session.discard();
        onCancel();
      }
    },
    resolve: (choice) => {
      if (locked || !session.ownsEditor(editorOwner)) {
        return;
      }
      session.resolve(choice);
      if (choice === "local") {
        save();
      } else {
        onCancel();
      }
    },
  };
}
