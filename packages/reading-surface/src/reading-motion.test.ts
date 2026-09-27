import { describe, expect, it, vi } from "vitest";

import { pageMotionTracker, scrollMotionTracker } from "./reading-motion.js";

import type { ReadingMotion } from "./types.js";

function track(offsets: readonly number[]): ReadingMotion[] {
  const motions: ReadingMotion[] = [];
  const tracker = scrollMotionTracker((motion) => motions.push(motion));
  offsets.forEach(tracker.track);
  return motions;
}

describe("scrollMotionTracker", () => {
  it("reports reading on once the reader has travelled", () => {
    expect(track([0, 20, 40, 60, 200, 400])).toEqual(["start", "forward"]);
  });

  it("ignores jitter smaller than the travel threshold", () => {
    expect(track([100, 140, 180, 170, 160, 175])).toEqual(["forward"]);
  });

  it("reports turning back after travelling up", () => {
    expect(track([100, 300, 500, 480, 440, 400])).toEqual(["forward", "backward"]);
  });

  it("treats scrolling just after a resize as layout, not reading", () => {
    vi.useFakeTimers();
    const motions: ReadingMotion[] = [];
    const tracker = scrollMotionTracker((motion) => motions.push(motion));
    tracker.track(300);
    tracker.resized();
    [360, 420].forEach(tracker.track);
    vi.advanceTimersByTime(400);
    [430, 440].forEach(tracker.track);
    expect(motions).toEqual([]);
    [480].forEach(tracker.track);
    expect(motions).toEqual(["forward"]);
    vi.useRealTimers();
  });

  it("reports the top of the document", () => {
    expect(track([300, 500, 200, 4])).toEqual(["forward", "backward", "start"]);
  });
});

describe("pageMotionTracker", () => {
  it("follows page turns", () => {
    const motions: ReadingMotion[] = [];
    const update = pageMotionTracker((motion) => motions.push(motion));
    [3, 4, 4, 3, 0].forEach(update);
    expect(motions).toEqual(["forward", "backward", "start"]);
  });
});
