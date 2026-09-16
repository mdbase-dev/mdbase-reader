import type { Annotation } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

/**
 * PDF geometry remains attached to a stable file across incremental saves, native annotations,
 * metadata edits, and other byte-only revisions. Reflowable targets retain their stricter revision
 * check because their structural locators can change when the document bytes change.
 */
export function annotationMatchesSurface(annotation: Annotation, surface: ReadingSurface): boolean {
  const target = annotation.document;
  if (!target) {
    return true;
  }
  if (target.fileId !== surface.document.document.fileId) {
    return false;
  }
  return Boolean(annotation.target?.pdf) || target.revision === surface.document.document.revision;
}
