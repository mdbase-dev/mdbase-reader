import { useContext, useEffect } from "react";

import { annotationEditSession } from "./annotation-edit-session-cache.js";
import { AnnotationEditingContext } from "./AnnotationEditingContext.js";
import { refreshSharedAnnotation } from "./shared-annotation-resource.js";

import type { AnnotationEditSession, PersistAnnotation } from "./annotation-edit-session.js";
import type { Annotation } from "@mdbase-reader/core";

const fallbackScope = Object.freeze({});

/** Recovery resumes when the record is visible, without requiring an editor to be opened. */
export function useAnnotationSession(
  annotation: Annotation,
  persist: PersistAnnotation,
): AnnotationEditSession {
  const scope = useContext(AnnotationEditingContext);
  const session = annotationEditSession(
    scope ?? fallbackScope,
    annotation,
    persist,
    scope?.refreshAnnotation ? (base) => refreshSharedAnnotation(scope, base) : undefined,
    scope?.recoverAnnotationBody && scope.mutationPending
      ? {
          recover: scope.recoverAnnotationBody.bind(scope),
          isPending: scope.mutationPending.bind(scope),
        }
      : undefined,
  );
  useEffect(() => {
    session.start();
    session.receive(annotation);
  }, [session, annotation]);
  return session;
}
