import {
  epubChapterProposals,
  pdfChapterProposals,
  type ChapterProposal,
} from "./source-part-creation.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { DocumentDescriptor, DocumentRange } from "@mdbase-reader/core";

export interface ChapterOutline {
  readonly proposals: readonly ChapterProposal[];
  readonly pageCount?: number;
  readonly spine?: readonly string[];
}

export async function readChapterOutline(
  gateway: ReaderWorkspaceGateway,
  document: DocumentDescriptor,
  signal?: AbortSignal,
): Promise<ChapterOutline> {
  const { bytes } = await gateway.readFile(
    document.file,
    document.revision,
    signal ? { signal } : {},
  );
  signal?.throwIfAborted();
  if (document.mediaType === "application/pdf") {
    const { readPdfChapterOutline } = await import("@mdbase-reader/renderer-pdf/details");
    const outline = await readPdfChapterOutline(bytes, signal ? { signal } : {});
    return {
      pageCount: outline.pageCount,
      proposals: pdfChapterProposals(outline.entries, outline.pageCount),
    };
  }
  if (document.mediaType === "application/epub+zip") {
    const { readEpubChapterOutline } = await import("@mdbase-reader/renderer-epub/details");
    const outline = await readEpubChapterOutline(bytes);
    return {
      spine: outline.spine,
      proposals: epubChapterProposals(outline.entries, outline.spine),
    };
  }
  throw new Error("Chapter ranges require a PDF or EPUB.");
}

// The two disjoint range forms have intentionally explicit field checks.
// eslint-disable-next-line complexity
export function validateChapterRange(
  range: DocumentRange | undefined,
  outline: ChapterOutline,
): void {
  if (
    range?.kind === "pages" &&
    outline.pageCount &&
    Number.isSafeInteger(range.start) &&
    Number.isSafeInteger(range.end) &&
    range.start >= 0 &&
    range.end >= range.start &&
    range.end < outline.pageCount
  ) {
    return;
  }
  if (range?.kind === "epub-spine" && outline.spine && !range.start_cfi && !range.end_cfi) {
    const start = outline.spine.indexOf(range.start);
    const end = outline.spine.indexOf(range.end);
    if (start >= 0 && end >= start) {
      return;
    }
  }
  throw new Error(
    "Invalid chapter range. Use absolute file-page indexes or whole spine resources from this document.",
  );
}
