import { annotationEmbed, bodyEmbedsAnnotation } from "@mdbase-reader/core";

import type { SourceDraftSession } from "./source-draft-session.js";
import type { Annotation, Source } from "@mdbase-reader/core";

export function insertAnnotationInDraft(
  session: SourceDraftSession,
  source: Source,
  annotation: Annotation,
): Promise<Source> {
  if (annotation.collectionId !== source.collectionId || annotation.sourceId !== source.id) {
    return Promise.reject(
      new Error("An annotation can only be inserted into its originating source note."),
    );
  }
  const path = annotation.path ?? `annotations/${annotation.id}.md`;
  const body = session.getText();
  if (!bodyEmbedsAnnotation(body, path)) {
    session.edit(`${body}\n\n${annotationEmbed(path)}\n`);
  }
  return session.flush();
}
