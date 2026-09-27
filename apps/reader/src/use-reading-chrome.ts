import { useEffect, useState } from "react";

import type { ReadingSurface } from "@mdbase-reader/reading-surface";

const settleMs = 1400;
/** The band at the top of the window where a pointer brings reading mode's chrome back. */
const revealBandPx = 64;
const chromeSelector = ".reader-header, .dv-tabs-and-actions-container";

/**
 * Whether Reader's header, tabs and phone bars are showing. They make way for the text:
 *
 * - In reading mode they hide once the reader settles, and return while the pointer is at the
 *   top edge or focus moves into them.
 * - While a phone shows a document they hide as the reader reads on.
 *
 * Either way, scrolling back, reaching the start, or tapping the page brings them back.
 */
export function useReadingChrome(input: {
  readonly focusMode: boolean;
  readonly autoHide: boolean;
  readonly surface: ReadingSurface | null;
}): boolean {
  const { focusMode, autoHide, surface } = input;
  const mode = focusMode ? "focus" : autoHide ? "auto" : null;
  // Hiding belongs to the document and mode it happened in; a new one starts with chrome showing.
  const [hiddenFor, setHiddenFor] = useState<{
    readonly surface: ReadingSurface | null;
    readonly mode: "focus" | "auto";
  } | null>(null);
  useEffect(() => {
    if (!mode || !surface) {
      return undefined;
    }
    const show = (): void => setHiddenFor(null);
    const motion = surface.capabilities.motion?.motions.subscribe((value) =>
      setHiddenFor(value === "forward" ? { surface, mode } : null),
    );
    const tapped = surface.capabilities.textSelection?.cleared?.subscribe(show);
    return () => {
      motion?.();
      tapped?.();
    };
  }, [mode, surface]);
  useEffect(() => {
    if (!focusMode) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const hideSoon = (): void => {
      timer ??= setTimeout(() => {
        timer = null;
        if (!chromeHasFocus()) {
          setHiddenFor({ surface, mode: "focus" });
        }
      }, settleMs);
    };
    // Moves over a document's frame never reach this window, so revealing also starts the
    // countdown; moves over the chrome keep restarting it.
    const reveal = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      setHiddenFor(null);
      hideSoon();
    };
    const onPointerMove = (event: PointerEvent): void => {
      const overChrome =
        event.target instanceof Element && event.target.closest(chromeSelector) !== null;
      if (event.clientY <= revealBandPx || overChrome) {
        reveal();
      } else {
        hideSoon();
      }
    };
    const onFocusIn = (event: FocusEvent): void => {
      if (event.target instanceof Element && event.target.closest(chromeSelector)) {
        reveal();
      }
    };
    hideSoon();
    globalThis.addEventListener("pointermove", onPointerMove);
    globalThis.addEventListener("focusin", onFocusIn);
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("focusin", onFocusIn);
    };
  }, [focusMode, surface]);
  return !mode || hiddenFor?.surface !== surface || hiddenFor.mode !== mode;
}

function chromeHasFocus(): boolean {
  return Boolean(document.activeElement?.closest(chromeSelector));
}
