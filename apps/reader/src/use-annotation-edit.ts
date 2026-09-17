import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import { useAnnotationDeletion } from "./use-annotation-deletion.js";
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
  const draft = useAnnotationDraft(session.key);
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
  const locked = snapshot.locked || snapshot.status === "saving";
  const deletion = useAnnotationDeletion(
    session,
    props,
    !locked && !editingElsewhere && draft.ready,
  );
  const cancel = (): void => {
    if (locked) {
      return;
    }
    // Close/Escape keeps recovery text; only Done writes to the collection.
    onCancel();
  };
  const save = (): void => {
    if (locked || !session.ownsEditor(editorOwner) || !draft.ready) {
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
    draft,
    session,
    conflict: snapshot.conflict,
    status: snapshot.status,
    locked,
    problem: deletion.problem ?? snapshot.problem,
    canSave: draft.ready && !locked && !editingElsewhere && !snapshot.conflict,
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
