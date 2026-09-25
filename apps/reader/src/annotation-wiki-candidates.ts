import { annotationBodyContent } from "./annotation-body-content.js";
import { annotationKindLabel } from "./annotation-kind.js";

import type { Annotation } from "@mdbase-reader/core";
import type { WikiLinkCandidate } from "@mdbase-reader/markdown-editor";

export function annotationWikiCandidate(annotation: Annotation): WikiLinkCandidate {
  const { quote, note } = annotationBodyContent(annotation.body);
  const label = quote?.slice(0, 72) ?? note.slice(0, 72);
  return {
    // A bookmark may have no words of its own; its place names it instead.
    label: label.length > 0 ? label : (annotation.locator?.label ?? "Untitled annotation"),
    path: annotationWikiPath(annotation),
    kind: annotationKindLabel(annotation.annotationType).toLocaleLowerCase(),
    detail: annotation.locator?.label ?? "Whole source",
    ...(quote ? { quote } : {}),
    ...(note ? { note } : {}),
    embed: true,
  };
}

export function annotationWikiPath(annotation: Annotation): string {
  return (annotation.path ?? `annotations/${annotation.id}.md`).replace(/\.md$/u, "");
}
