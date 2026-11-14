import { annotationDraftKey } from "./annotation-drafts.js";
import { AnnotationEditSession } from "./annotation-edit-session.js";

import type { Mdbase } from "@mdbase-reader/connect";
import type { Annotation } from "@mdbase-reader/core";

const sessions = new WeakMap<
  NonNullable<ReturnType<Mdbase["connection"]>>,
  Map<string, AnnotationEditSession>
>();
export function annotationEditSession(
  mdbase: Mdbase,
  annotation: Annotation,
  publish: (annotation: Annotation) => void,
): AnnotationEditSession {
  const connection = mdbase.connection(annotation.collectionId);
  if (!connection) {
    throw new Error("Annotation editing requires an open collection.");
  }
  let cache = sessions.get(connection);
  if (!cache) {
    cache = new Map();
    sessions.set(connection, cache);
  }
  const key = annotationDraftKey(annotation.collectionId, annotation.sourceId, annotation.id);
  let session = cache.get(key);
  if (!session) {
    session = new AnnotationEditSession(mdbase, annotation, publish);
    cache.set(key, session);
  }
  return session;
}
