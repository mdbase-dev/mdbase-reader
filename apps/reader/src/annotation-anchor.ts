import type { AnnotationTarget } from "@mdbase-reader/core";

/** A quotation or a human-written page label alone is not a navigable selector. */
export function hasPassageAnchor(target: AnnotationTarget | undefined): target is AnnotationTarget {
  return Boolean(target?.pdf ?? target?.epub ?? target?.html);
}
