import { useCallback, useEffect, useRef } from "react";

import type { PointerEvent as ReactPointerEvent } from "react";

const holdMs = 480;
const slopPx = 10;

export interface LongPress {
  /** Pointer handlers for one item; only touch pointers start a press. */
  readonly bind: (onLongPress: () => void) => {
    readonly onPointerDown: (event: ReactPointerEvent) => void;
    readonly onPointerMove: (event: ReactPointerEvent) => void;
    readonly onPointerUp: () => void;
    readonly onPointerCancel: () => void;
    readonly onContextMenu: (event: { preventDefault: () => void }) => void;
  };
  /** True once for the click that ends a long press, so it does not also act as a tap. */
  readonly consumeClick: () => boolean;
}

/** Touch long-press: a finger held still selects, so moving it (scrolling) never does. */
export function useLongPress(): LongPress {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = useCallback((): void => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = null;
    start.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const bind = useCallback<LongPress["bind"]>(
    (onLongPress) => ({
      onPointerDown: (event) => {
        if (event.pointerType !== "touch") {
          return;
        }
        cancel();
        fired.current = false;
        start.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          fired.current = true;
          timer.current = null;
          // Safari has no vibration API, though the DOM types declare it.
          if ("vibrate" in globalThis.navigator) {
            globalThis.navigator.vibrate(8);
          }
          onLongPress();
        }, holdMs);
      },
      onPointerMove: (event) => {
        const origin = start.current;
        if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > slopPx) {
          cancel();
        }
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      // Android opens a context menu on a long press; the press is ours.
      onContextMenu: (event) => {
        if (fired.current) {
          event.preventDefault();
        }
      },
    }),
    [cancel],
  );
  const consumeClick = useCallback((): boolean => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);
  return { bind, consumeClick };
}

/** Whether a click asks for a keyboard-modified gesture (range or toggle) rather than a tap. */
export function hasModifier(event: {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}): boolean {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}
