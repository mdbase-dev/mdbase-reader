import { useEffect, type RefObject } from "react";

import type { ReadingSurface } from "@mdbase-reader/reading-surface";

const settleMs = 1400;
/** The band at the top of the window where a pointer brings reading mode's chrome back. */
const revealBandPx = 64;
const chromeSelector = ".reader-header, .dv-tabs-and-actions-container";
/** Set on the shell while its chrome is hidden; styles key off it. */
export const chromeHiddenAttribute = "data-chrome-hidden";

/**
 * Hides and shows Reader's header, tabs and phone bars so they make way for the text:
 *
 * - In reading mode they hide once the reader settles, and return while the pointer is at the
 *   top edge or focus moves into them.
 * - While a phone shows a document they hide as the reader reads on.
 *
 * Either way, scrolling back, reaching the start, or tapping the page brings them back. This
 * happens mid-scroll, so it sets an attribute on the shell rather than React state: re-rendering
 * the whole workspace for it cost more than the change itself.
 */
export function useReadingChrome(input: {
  readonly shell: RefObject<HTMLElement | null>;
  readonly focusMode: boolean;
  readonly autoHide: boolean;
  readonly surface: ReadingSurface | null;
  /** Lays the workspace out at once when the chrome changes; see `setChromeHidden`. */
  readonly onChange: () => void;
}): void {
  const { shell, focusMode, autoHide, surface, onChange } = input;
  useEffect(() => {
    const setHidden = (hidden: boolean): void => setChromeHidden(shell, hidden, onChange);
    // A new document or mode starts with its chrome showing.
    setHidden(false);
    if (!(focusMode || autoHide) || !surface) {
      return undefined;
    }
    const motion = surface.capabilities.motion?.motions.subscribe((value) =>
      setHidden(value === "forward"),
    );
    const tapped = surface.capabilities.textSelection?.cleared?.subscribe(() => setHidden(false));
    return () => {
      motion?.();
      tapped?.();
      setHidden(false);
    };
  }, [autoHide, focusMode, onChange, shell, surface]);
  useEffect(() => {
    if (!focusMode) {
      return undefined;
    }
    const setHidden = (hidden: boolean): void => setChromeHidden(shell, hidden, onChange);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const hideSoon = (): void => {
      timer ??= setTimeout(() => {
        timer = null;
        if (!chromeHasFocus()) {
          setHidden(true);
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
      setHidden(false);
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
      setHidden(false);
    };
  }, [focusMode, onChange, shell]);
}

/**
 * Motion is reported with every scroll, so only a real change touches the page. A change resizes
 * the workspace, which the dock otherwise notices a frame or more later: meanwhile the document
 * has moved but not grown, leaving a band of background, then jumps again. `onChange` lays it out
 * in the same frame instead.
 */
function setChromeHidden(
  shell: RefObject<HTMLElement | null>,
  hidden: boolean,
  onChange: () => void,
): void {
  const element = shell.current;
  if (!element || element.hasAttribute(chromeHiddenAttribute) === hidden) {
    return;
  }
  element.toggleAttribute(chromeHiddenAttribute, hidden);
  onChange();
}

function chromeHasFocus(): boolean {
  return Boolean(document.activeElement?.closest(chromeSelector));
}
