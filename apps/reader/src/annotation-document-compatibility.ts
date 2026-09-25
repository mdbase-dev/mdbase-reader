import type { Annotation } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

/**
 * PDF geometry remains attached to a stable file across incremental saves, native annotations,
 * metadata edits, and other byte-only revisions. HTML quotations can be relocated in the
 * current document by the HTML renderer. EPUB CFIs remain version-specific: following a stale
 * CFI without checking its text could silently lead to the wrong passage. A PDF bookmark names
 * only a page, which likewise survives byte-only revisions.
 */
export function annotationMatchesSurface(annotation: Annotation, surface: ReadingSurface): boolean {
  const target = annotation.document;
  if (!target) {
    return true;
  }
  if (target.fileId !== surface.document.document.fileId) {
    return false;
  }
  return (
    Boolean(annotation.target?.pdf) ||
    annotation.target?.position?.kind === "pdf" ||
    Boolean(annotation.target?.html && annotation.target.quote?.exact) ||
    target.revision === surface.document.document.revision
  );
}
