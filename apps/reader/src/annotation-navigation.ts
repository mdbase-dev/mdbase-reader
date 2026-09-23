import { hasPassageAnchor } from "./annotation-anchor.js";
import { annotationMatchesSurface } from "./annotation-document-compatibility.js";

import type { Annotation } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export async function navigateToAnnotation(
  annotation: Annotation,
  surface: ReadingSurface,
): Promise<void> {
  if (!annotationMatchesSurface(annotation, surface)) {
    throw new Error(
      "This annotation belongs to a different document revision. Open its original document to locate it.",
    );
  }
  const target = annotation.target;
  if (!hasPassageAnchor(target)) {
    throw new Error(
      "This annotation has no supported passage anchor. Its text and original metadata are preserved.",
    );
  }
  let found = false;
  if (target.pdf) {
    found = await surface.goTo({ kind: "pdf", pageIndex: target.pdf.pageIndex });
  } else if (target.epub) {
    found = await surface.goTo({
      kind: "epub",
      locator: { type: "application/xhtml+xml", locations: { fragments: [target.epub.cfi] } },
    });
  } else if (target.html) {
    found = (await surface.capabilities.annotationNavigation?.goToAnnotation(annotation)) ?? false;
  }
  if (!found) {
    throw new Error(
      "Could not locate this passage. The annotation is safe; the document may have changed.",
    );
  }
}
