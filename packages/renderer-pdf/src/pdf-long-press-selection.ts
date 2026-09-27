import type { Unsubscribe } from "@mdbase-reader/reading-surface";

/** How long a still finger waits before it selects instead of scrolling. */
const holdMs = 420;
/** How far a finger may drift and still count as holding still. */
const slopPx = 10;

/** Switches the viewer between panning (a finger scrolls) and selecting text. */
export interface PdfSelectionModes {
  select(): void;
  pan(): void;
}

/** The part of EmbedPDF's selection events the gesture follows. */
export interface PdfSelectionEvents {
  onSelectionChange(listener: (event: { readonly selection: unknown }) => void): Unsubscribe;
}

interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  /** The element under the finger, inside the viewer's shadow root. */
  readonly target: EventTarget;
  timer: ReturnType<typeof setTimeout> | null;
  holding: boolean;
  travel: number;
}

/**
 * Selects PDF text on a phone the way the rest of Reader does: hold a finger on the text, then
 * drag to extend the selection. Plain swipes keep scrolling.
 *
 * The viewer pans while a finger is the main pointer, because its selecting mode claims every
 * drag. When a finger holds still, Reader switches it to selecting and replays the press at the
 * same point, so the viewer anchors a selection there; it then blocks scrolling for the rest of
 * that gesture so the drag extends the selection. Lifting without dragging selects the word, as a
 * double click does. The viewer keeps selecting until that selection is dismissed (switching
 * modes would clear it), then pans again.
 */
export function installLongPressSelection(input: {
  readonly host: HTMLElement;
  readonly modes: PdfSelectionModes;
  readonly selection: PdfSelectionEvents;
}): Unsubscribe {
  const gesture = new LongPressSelection(input.host, input.modes);
  const stopSelection = input.selection.onSelectionChange((event) =>
    gesture.selectionChanged(event.selection !== null),
  );
  const stopListening = gesture.listen();
  return () => {
    stopSelection();
    stopListening();
  };
}

class LongPressSelection {
  #press: Press | null = null;
  #selected = false;
  #awaitingDismissal = false;
  /** Until when the click that ends a hold is swallowed; see `#click`. */
  #swallowClickUntil = 0;
  /** Set while the press is replayed, so the gesture does not take its own event for a touch. */
  #replaying = false;

  public constructor(
    private readonly host: HTMLElement,
    private readonly modes: PdfSelectionModes,
  ) {}

  public listen(): Unsubscribe {
    const capture = { capture: true };
    const pointer: readonly [string, (event: PointerEvent) => void][] = [
      ["pointerdown", this.#down],
      ["pointermove", this.#move],
      ["pointerup", this.#up],
      ["pointercancel", this.#cancel],
    ];
    for (const [type, listener] of pointer) {
      this.host.addEventListener(type, listener as EventListener, capture);
    }
    this.host.addEventListener("contextmenu", this.#contextMenu, capture);
    this.host.addEventListener("click", this.#click, capture);
    // Once a hold has begun, the finger belongs to the selection, not to scrolling.
    this.host.addEventListener("touchmove", this.#touchMove, { capture: true, passive: false });
    return () => {
      this.#release();
      for (const [type, listener] of pointer) {
        this.host.removeEventListener(type, listener as EventListener, capture);
      }
      this.host.removeEventListener("contextmenu", this.#contextMenu, capture);
      this.host.removeEventListener("click", this.#click, capture);
      this.host.removeEventListener("touchmove", this.#touchMove, capture);
    };
  }

  public selectionChanged(selected: boolean): void {
    this.#selected = selected;
    // A new touch clears the selection as it lands; that dismissal returns to panning at once.
    if (!selected && this.#awaitingDismissal && !this.#press?.holding) {
      this.#awaitingDismissal = false;
      this.modes.pan();
    }
  }

  readonly #down = (event: PointerEvent): void => {
    if (this.#replaying || event.pointerType !== "touch" || !event.isPrimary) {
      return;
    }
    this.#release();
    const press: Press = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      target: event.composedPath()[0] ?? event.target ?? this.host,
      timer: null,
      holding: false,
      travel: 0,
    };
    press.timer = setTimeout(() => this.#hold(press), holdMs);
    this.#press = press;
  };

  readonly #move = (event: PointerEvent): void => {
    const press = this.#press;
    if (press?.pointerId !== event.pointerId) {
      return;
    }
    press.travel = Math.max(
      press.travel,
      Math.hypot(event.clientX - press.x, event.clientY - press.y),
    );
    if (!press.holding && press.travel > slopPx) {
      this.#release();
    }
  };

  readonly #up = (event: PointerEvent): void => {
    const press = this.#press;
    if (press?.pointerId !== event.pointerId) {
      return;
    }
    this.#release();
    if (!press.holding) {
      return;
    }
    this.#swallowClickUntil = performance.now() + 500;
    if (press.travel <= slopPx) {
      this.#replay("dblclick", press);
    }
    this.#awaitingDismissal = true;
    // A hold on blank space selects nothing; there is nothing to wait for.
    requestAnimationFrame(() => {
      if (this.#awaitingDismissal && !this.#selected) {
        this.#awaitingDismissal = false;
        this.modes.pan();
      }
    });
  };

  readonly #cancel = (event: PointerEvent): void => {
    const press = this.#press;
    if (press?.pointerId !== event.pointerId) {
      return;
    }
    this.#release();
    if (press.holding && !this.#selected) {
      this.modes.pan();
    }
  };

  readonly #touchMove = (event: TouchEvent): void => {
    if (this.#press?.holding && event.cancelable) {
      event.preventDefault();
    }
  };

  // The lift that ends a hold also sends a click; after the word's double click, the viewer would
  // take it for a triple click and select the whole line.
  readonly #click = (event: MouseEvent): void => {
    if (performance.now() < this.#swallowClickUntil) {
      this.#swallowClickUntil = 0;
      event.stopPropagation();
    }
  };

  // A long press would otherwise open the browser's image or link menu over the page.
  readonly #contextMenu = (event: Event): void => {
    if (this.#press) {
      event.preventDefault();
    }
  };

  #hold(press: Press): void {
    press.timer = null;
    press.holding = true;
    if ("vibrate" in navigator) {
      navigator.vibrate(8);
    }
    this.modes.select();
    this.#replay("pointerdown", press);
  }

  #replay(type: "pointerdown" | "dblclick", press: Press): void {
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: press.x,
      clientY: press.y,
      button: 0,
    };
    this.#replaying = true;
    press.target.dispatchEvent(
      type === "dblclick"
        ? new MouseEvent(type, init)
        : new PointerEvent(type, {
            ...init,
            buttons: 1,
            pointerId: press.pointerId,
            pointerType: "touch",
            isPrimary: true,
          }),
    );
    this.#replaying = false;
  }

  #release(): void {
    if (this.#press?.timer) {
      clearTimeout(this.#press.timer);
    }
    this.#press = null;
  }
}
