import type { ReadingMotion } from "./types.js";

const startPx = 8;
const travelPx = 32;
/** How long after a resize or a jump the page is settling rather than moved by the reader. */
const settleMs = 300;
/** Settling lasts until the page has been still this long, so a smooth jump is not reading. */
const settleQuietMs = 150;

/**
 * Turns successive scroll offsets into reading motion. Small jitters are ignored: the reader must
 * travel a little way in one direction before it counts, and each motion is reported once.
 * Offsets that follow `settle` — a resize (a rotated phone, a collapsing toolbar) or a jump the
 * renderer made (restoring a position, showing an annotation) — only move the baseline.
 */
export function scrollMotionTracker(emit: (motion: ReadingMotion) => void): {
  readonly track: (scrollTop: number) => void;
  readonly settle: () => void;
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
    const now = performance.now();
    if (now < settlingUntil) {
      settlingUntil = Math.max(settlingUntil, now + settleQuietMs);
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
    settle: () => {
      settlingUntil = performance.now() + settleMs;
    },
  };
}

/**
 * Reports reading motion from successive positions in a paginated document. After `settle`, a
 * position change is not a page turn: a resize reflows the pages and can move the position by a
 * page or so (reporting it would hide or show the chrome, resize the pages again, and repeat),
 * and a jump the renderer made is not the reader paging.
 */
export function pageMotionTracker(emit: (motion: ReadingMotion) => void): {
  readonly track: (position: number) => void;
  readonly settle: () => void;
} {
  let previous: number | null = null;
  let settlingUntil = 0;
  return {
    track: (position) => {
      if (previous !== null && position !== previous && performance.now() >= settlingUntil) {
        emit(position <= 0 ? "start" : position > previous ? "forward" : "backward");
      }
      previous = position;
    },
    settle: () => {
      settlingUntil = performance.now() + settleMs;
    },
  };
}
