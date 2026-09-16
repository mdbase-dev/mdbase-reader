import { annotationBodyContent } from "./annotation-body-content.js";

import type { Annotation } from "@mdbase-reader/core";
import type { WikiLinkCandidate } from "@mdbase-reader/markdown-editor";

export function annotationWikiCandidate(annotation: Annotation): WikiLinkCandidate {
  const { quote, note } = annotationBodyContent(annotation.body);
  const label = quote?.slice(0, 72) ?? note.slice(0, 72);
  return {
    label: label.length > 0 ? label : "Untitled annotation",
    path: annotationWikiPath(annotation),
    kind: annotation.annotationType,
    detail: annotation.locator?.label ?? "Source note",
    ...(quote ? { quote } : {}),
    ...(note ? { note } : {}),
    embed: true,
  };
}

export function annotationWikiPath(annotation: Annotation): string {
  return (annotation.path ?? `annotations/${annotation.id}.md`).replace(/\.md$/u, "");
}
