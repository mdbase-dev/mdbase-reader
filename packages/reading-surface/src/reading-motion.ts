import type { ReadingMotion } from "./types.js";

const startPx = 8;
const travelPx = 32;
/** How long after a resize scrolling is the layout settling rather than the reader moving. */
const resizeSettleMs = 300;

/**
 * Turns successive scroll offsets into reading motion. Small jitters are ignored: the reader must
 * travel a little way in one direction before it counts, and each motion is reported once.
 * Offsets that follow a resize (a rotated phone, a collapsing toolbar) only move the baseline.
 */
export function scrollMotionTracker(emit: (motion: ReadingMotion) => void): {
  readonly track: (scrollTop: number) => void;
  readonly resized: () => void;
} {
  let reported: ReadingMotion | null = null;
  let heading: "forward" | "backward" | null = null;
  let turnedAt = 0;
  let previous: number | null = null;
  let settlingUntil = 0;
  const report = (motion: ReadingMotion): void => {
    if (motion !== reported) {
      reported = motion;
      emit(motion);
    }
  };
  const track = (scrollTop: number): void => {
    if (performance.now() < settlingUntil) {
      heading = null;
      previous = scrollTop;
      return;
    }
    if (scrollTop <= startPx) {
      heading = null;
      previous = scrollTop;
      report("start");
      return;
    }
    if (previous !== null && scrollTop !== previous) {
      const now = scrollTop > previous ? "forward" : "backward";
      if (now !== heading) {
        heading = now;
        turnedAt = previous;
      }
    }
    previous = scrollTop;
    if (heading && Math.abs(scrollTop - turnedAt) >= travelPx) {
      report(heading);
    }
  };
  return {
    track,
    resized: () => {
      settlingUntil = performance.now() + resizeSettleMs;
    },
  };
}

/** Reports reading motion from successive positions in a paginated document. */
export function pageMotionTracker(
  emit: (motion: ReadingMotion) => void,
): (position: number) => void {
  let previous: number | null = null;
  return (position) => {
    if (previous !== null && position !== previous) {
      emit(position <= 0 ? "start" : position > previous ? "forward" : "backward");
    }
    previous = position;
  };
}
