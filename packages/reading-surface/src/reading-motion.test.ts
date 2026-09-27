import { describe, expect, it, vi } from "vitest";

import { pageMotionTracker, scrollMotionTracker } from "./reading-motion.js";

import type { ReadingMotion } from "./types.js";

function track(offsets: readonly number[]): ReadingMotion[] {
  const motions: ReadingMotion[] = [];
  const tracker = scrollMotionTracker((motion) => motions.push(motion));
  offsets.forEach(tracker.track);
  return motions;
}

/** The motions as the reader would describe them: each change of direction once. */
function turns(motions: readonly ReadingMotion[]): ReadingMotion[] {
  return motions.filter((motion, index) => motion !== motions[index - 1]);
}

describe("scrollMotionTracker", () => {
  it("reports reading on once the reader has travelled", () => {
    expect(turns(track([0, 20, 40, 60, 200, 400]))).toEqual(["start", "forward"]);
  });

  it("ignores jitter smaller than the travel threshold", () => {
    expect(turns(track([100, 140, 180, 170, 160, 175]))).toEqual(["forward"]);
  });

  it("reports turning back after travelling up", () => {
    expect(turns(track([100, 300, 500, 480, 440, 400]))).toEqual(["forward", "backward"]);
  });

  it("keeps reporting while the reader keeps going, so an overruled listener hears it again", () => {
    // The chrome may be shown by a tap mid-read; reading on must hide it again.
    expect(track([100, 140, 180, 220])).toEqual(["forward", "forward", "forward"]);
  });

  it("reports the top of the document", () => {
    expect(turns(track([300, 500, 200, 4]))).toEqual(["forward", "backward", "start"]);
  });

  it("lets a flick continue through a resize, turning back included", () => {
    vi.useFakeTimers();
    const motions: ReadingMotion[] = [];
    const tracker = scrollMotionTracker((motion) => motions.push(motion));
    // The chrome hides mid-flick, resizing the page; events keep coming every 16 ms.
    let top = 1000;
    for (let step = 0; step < 10; step += 1) {
      top += 20;
      tracker.track(top);
      vi.advanceTimersByTime(16);
    }
    tracker.settle("resize");
    for (let step = 0; step < 30; step += 1) {
      top += step < 10 ? 20 : -20;
      tracker.track(top);
      vi.advanceTimersByTime(16);
    }
    expect(turns(motions)).toEqual(["forward", "backward"]);
    vi.useRealTimers();
  });

  it("ignores the offsets a resize produces", () => {
    vi.useFakeTimers();
    const motions: ReadingMotion[] = [];
    const tracker = scrollMotionTracker((motion) => motions.push(motion));
    tracker.track(300);
    tracker.settle("resize");
    [360, 420].forEach(tracker.track);
    vi.advanceTimersByTime(200);
    [430, 440].forEach(tracker.track);
    expect(motions).toEqual([]);
    tracker.track(480);
    expect(motions).toEqual(["forward"]);
    vi.useRealTimers();
  });

  it("keeps settling while a smooth jump is still scrolling", () => {
    vi.useFakeTimers();
    const motions: ReadingMotion[] = [];
    const tracker = scrollMotionTracker((motion) => motions.push(motion));
    tracker.track(100);
    tracker.settle("jump");
    for (let step = 1; step <= 10; step += 1) {
      vi.advanceTimersByTime(100);
      tracker.track(100 + step * 200);
    }
    expect(motions).toEqual([]);
    vi.useRealTimers();
  });
});

describe("pageMotionTracker", () => {
  it("follows page turns", () => {
    const motions: ReadingMotion[] = [];
    const tracker = pageMotionTracker((motion) => motions.push(motion));
    [3, 4, 4, 3, 0].forEach(tracker.track);
    expect(motions).toEqual(["forward", "backward", "start"]);
  });

  it("treats a position change just after settling as reflow or a jump, not a page turn", () => {
    vi.useFakeTimers();
    const motions: ReadingMotion[] = [];
    const tracker = pageMotionTracker((motion) => motions.push(motion));
    tracker.track(5);
    tracker.settle();
    tracker.track(4);
    expect(motions).toEqual([]);
    vi.advanceTimersByTime(400);
    tracker.track(5);
    expect(motions).toEqual(["forward"]);
    vi.useRealTimers();
  });
});
