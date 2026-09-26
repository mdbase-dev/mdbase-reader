import { annotationDraftKey } from "./annotation-drafts.js";
import {
  AnnotationEditSession,
  type AnnotationRecovery,
  type PersistAnnotation,
} from "./annotation-edit-session.js";

import type { Annotation } from "@mdbase-reader/core";

const sessions = new WeakMap<object, Map<string, AnnotationEditSession>>();

export function annotationEditSession(
  scope: object,
  annotation: Annotation,
  persist: PersistAnnotation,
  refresh?: (annotation: Annotation) => Promise<Annotation | null>,
  recovery?: AnnotationRecovery,
): AnnotationEditSession {
  let cache = sessions.get(scope);
  if (!cache) {
    cache = new Map();
    sessions.set(scope, cache);
  }
  const key = annotationDraftKey(annotation.collectionId, annotation.sourceId, annotation.id);
  let session = cache.get(key);
  if (!session) {
    session = new AnnotationEditSession(annotation, persist, refresh, recovery);
    cache.set(key, session);
  }
  return session;
}
