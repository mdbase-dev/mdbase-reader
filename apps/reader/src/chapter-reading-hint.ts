import { t as translate } from "@lingui/core/macro";

import type { ReadingRangeLocation, ReadingRangeResolution } from "@mdbase-reader/reading-surface";

/**
 * Why the slim chapter hint above a document is showing. Chapter reading is otherwise quiet: the
 * hint appears only when the range cannot be used, the chapter start could not be opened, or the
 * reader has left the chapter's pages after reading inside them.
 */
export type ChapterHintKind = "invalid" | "problem" | "before" | "after";

export interface ChapterHintInput {
  readonly range: ReadingRangeResolution;
  readonly location: ReadingRangeLocation | null;
  /** True once the reader has been inside the range in this session. */
  readonly entered: boolean;
  readonly problem: string | null;
}

export function chapterHintKind({
  range,
  location,
  entered,
  problem,
}: ChapterHintInput): ChapterHintKind | null {
  if (problem) {
    return "problem";
  }
  if (!range.valid) {
    return "invalid";
  }
  // Opening a chapter can briefly report the file's first page before the resume position lands,
  // so being outside counts only after the reader has actually read inside the chapter.
  if (!entered || !location || location.position === "inside") {
    return null;
  }
  return location.position;
}

/** A dismissal lasts until the hint's reason clears, so leaving the chapter again shows it again. */
export function nextChapterHintDismissal(
  dismissed: ChapterHintKind | null,
  kind: ChapterHintKind | null,
): ChapterHintKind | null {
  return kind === null ? null : dismissed;
}

export function chapterHintVisible(
  kind: ChapterHintKind | null,
  dismissed: ChapterHintKind | null,
): kind is ChapterHintKind {
  return kind !== null && kind !== dismissed;
}

export function chapterHintText(
  kind: ChapterHintKind,
  range: ReadingRangeResolution,
  problem: string | null,
): string {
  switch (kind) {
    case "problem":
      return problem ?? translate({ message: "The chapter start could not be opened." });
    case "invalid":
      return range.valid
        ? translate({ message: "This chapter’s pages could not be found." })
        : range.message;
    case "before":
    case "after":
      return translate({ message: "You’ve left this chapter" });
  }
}

/** The compact progress shown in the chapter chip. */
export function chapterProgressLabel(
  range: ReadingRangeResolution,
  location: ReadingRangeLocation | null,
): string | undefined {
  if (!range.valid) {
    return translate({ message: "Range unavailable" });
  }
  if (location && location.position !== "inside") {
    return "Outside";
  }
  return location?.progress !== undefined
    ? `${String(Math.round(location.progress * 100))}%`
    : undefined;
}
