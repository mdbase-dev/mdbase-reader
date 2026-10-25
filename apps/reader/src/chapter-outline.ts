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

function validatePageRange(range: DocumentRange | undefined, pageCount: number): void {
  if (range?.kind !== "pages") {
    throw new Error("Enter a start page and an end page.");
  }
  for (const endpoint of ["start", "end"] as const) {
    const page = range[endpoint];
    if (!Number.isSafeInteger(page) || page < 0 || page >= pageCount) {
      throw new Error(
        `${endpoint === "start" ? "Start page" : "End page"} must be a whole number from 1 to ${String(pageCount)}.`,
      );
    }
  }
  if (range.end < range.start) {
    throw new Error("End page must be the same as or after the start page.");
  }
}

export function validateChapterRange(
  range: DocumentRange | undefined,
  outline: ChapterOutline,
): void {
  if (outline.pageCount !== undefined) {
    validatePageRange(range, outline.pageCount);
    return;
  }
  if (range?.kind === "epub-spine" && outline.spine && !range.start_cfi && !range.end_cfi) {
    const start = outline.spine.indexOf(range.start);
    const end = outline.spine.indexOf(range.end);
    if (start >= 0 && end >= start) {
      return;
    }
  }
  throw new Error("Choose a start section and an end section in reading order from this book.");
}
