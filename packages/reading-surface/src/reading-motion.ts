import type { ReadingMotion } from "./types.js";

const startPx = 8;
const travelPx = 32;
/** After a jump the renderer made, the page is settling rather than moved by the reader. */
const jumpSettleMs = 300;
/** A jump settles until the page has been still this long, so a smooth jump is not reading. */
const jumpQuietMs = 150;
/** A resize reflows the page within a frame or two; the reader's own scrolling soon resumes. */
const resizeSettleMs = 150;

/** Why the page is about to move without the reader moving it. */
export type MotionSettle = "resize" | "jump";

/**
 * Turns successive scroll offsets into reading motion. Small jitters are ignored: the reader must
 * travel a little way in one direction before it counts. The motion is reported with every
 * offset that keeps travelling, not once per change, so a listener that was overruled meanwhile
 * (the chrome shown by a tap, say) hears it again.
 *
 * Offsets after `settle` only move the baseline: briefly after a resize (a rotated phone, the
 * chrome collapsing), and after a jump the renderer made (restoring a position, showing an
 * annotation) until the page is still. A resize never waits for stillness, since the reader's
 * own flick continues through it.
 */
export function scrollMotionTracker(emit: (motion: ReadingMotion) => void): {
  readonly track: (scrollTop: number) => void;
  readonly settle: (reason: MotionSettle) => void;
} {
  let heading: "forward" | "backward" | null = null;
  let turnedAt = 0;
  let previous: number | null = null;
  let settlingUntil = 0;
  let untilStill = false;
  const track = (scrollTop: number): void => {
    const now = performance.now();
    if (now < settlingUntil) {
      if (untilStill) {
        settlingUntil = Math.max(settlingUntil, now + jumpQuietMs);
      }
      heading = null;
      previous = scrollTop;
      return;
    }
    if (scrollTop <= startPx) {
      heading = null;
      previous = scrollTop;
      emit("start");
      return;
    }
    if (previous !== null && scrollTop !== previous) {
      const direction = scrollTop > previous ? "forward" : "backward";
      if (direction !== heading) {
        heading = direction;
        turnedAt = previous;
      }
    }
    previous = scrollTop;
    if (heading && Math.abs(scrollTop - turnedAt) >= travelPx) {
      emit(heading);
    }
  };
  return {
    track,
    settle: (reason) => {
      untilStill = reason === "jump";
      settlingUntil = performance.now() + (reason === "jump" ? jumpSettleMs : resizeSettleMs);
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
      settlingUntil = performance.now() + jumpSettleMs;
    },
  };
}
