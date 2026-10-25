import { expect, it } from "vitest";

import {
  chapterHintKind,
  chapterHintText,
  chapterHintVisible,
  chapterProgressLabel,
  nextChapterHintDismissal,
} from "./chapter-reading-hint.js";

import type { ReadingRangeLocation, ReadingRangeResolution } from "@mdbase-reader/reading-surface";

const range: ReadingRangeResolution = {
  valid: true,
  start: { kind: "pdf", pageIndex: 10 },
  measure: () => null,
};
const invalid: ReadingRangeResolution = { valid: false, message: "Older revision" };
const at = (position: ReadingRangeLocation["position"], progress = 0.5): ReadingRangeLocation => ({
  position,
  atEnd: false,
  progress,
});

it("stays hidden while the reader is inside the chapter", () => {
  expect(
    chapterHintKind({ range, location: at("inside"), entered: true, problem: null }),
  ).toBeNull();
  expect(chapterHintKind({ range, location: null, entered: true, problem: null })).toBeNull();
});

it("shows only after the reader has left the chapter's pages", () => {
  // Before the resume position lands, a chapter can report the file's first page.
  expect(
    chapterHintKind({ range, location: at("before"), entered: false, problem: null }),
  ).toBeNull();
  expect(chapterHintKind({ range, location: at("before"), entered: true, problem: null })).toBe(
    "before",
  );
  expect(chapterHintKind({ range, location: at("after"), entered: true, problem: null })).toBe(
    "after",
  );
});

it("always reports an unusable range or a failed navigation", () => {
  expect(chapterHintKind({ range: invalid, location: null, entered: false, problem: null })).toBe(
    "invalid",
  );
  expect(
    chapterHintKind({ range, location: at("inside"), entered: true, problem: "Could not open" }),
  ).toBe("problem");
  expect(chapterHintText("invalid", invalid, null)).toBe("Older revision");
  expect(chapterHintText("problem", range, "Could not open")).toBe("Could not open");
  expect(chapterHintText("after", range, null)).toBe("You’ve left this chapter");
});

it("keeps a dismissal until the reader returns, so leaving again shows the hint again", () => {
  let dismissed = nextChapterHintDismissal("after", "after");
  expect(chapterHintVisible("after", dismissed)).toBe(false);
  // Moving further outside, or to the other side, is a new reason.
  expect(chapterHintVisible("before", dismissed)).toBe(true);
  dismissed = nextChapterHintDismissal(dismissed, null);
  expect(dismissed).toBeNull();
  expect(chapterHintVisible("after", dismissed)).toBe(true);
  expect(chapterHintVisible(null, null)).toBe(false);
});

it("labels chapter progress compactly", () => {
  expect(chapterProgressLabel(range, at("inside", 0.504))).toBe("50%");
  expect(chapterProgressLabel(range, at("after", 1))).toBe("Outside");
  expect(chapterProgressLabel(range, { position: "inside", atEnd: false })).toBeUndefined();
  expect(chapterProgressLabel(invalid, null)).toBe("Range unavailable");
});
