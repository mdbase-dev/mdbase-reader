import { useContext, useEffect } from "react";

import { annotationEditSession } from "./annotation-edit-session-cache.js";
import { AnnotationEditingContext } from "./AnnotationEditingContext.js";
import { useReaderMdbase } from "./reader-collections.js";
import { publishSharedAnnotation } from "./shared-annotation-resource.js";

import type { AnnotationEditSession } from "./annotation-edit-session.js";
import type { Annotation } from "@mdbase-reader/core";

/** Recovery resumes when the record is visible, without requiring an editor to be opened. */
export function useAnnotationSession(annotation: Annotation): AnnotationEditSession {
  const scope = useContext(AnnotationEditingContext);
  const mdbase = useReaderMdbase();
  if (!mdbase) {
    throw new Error("Annotation editing requires an open mdbase application.");
  }
  const session = annotationEditSession(mdbase, annotation, (saved) => {
    if (scope) {
      scope.forgetAnnotations?.();
      publishSharedAnnotation(scope, annotation, saved);
    }
  });
  useEffect(() => {
    session.start();
  }, [session, annotation]);
  return session;
}
