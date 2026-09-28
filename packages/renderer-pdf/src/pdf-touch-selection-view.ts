import type { Position, Rect } from "@embedpdf/models";

export type Endpoint = "start" | "end";
export interface TouchHandle {
  readonly button: HTMLButtonElement;
  readonly stem: SVGLineElement;
  focus: Position;
}

/** The only snippet-DOM dependency. EmbedPDF 2.15's Scroller has a relative, pixel-sized
 * content box centred with auto margins. Attaching here lets the browser do clipping,
 * scrolling and viewport placement; page geometry still comes from public APIs.
 * Fail closed if the snippet changes, rather than putting handles at guessed positions. */
export function findPdfScroller(root: ShadowRoot): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>("div[style]")) {
    const { style } = element;
    if (
      style.position === "relative" &&
      style.marginLeft === "auto" &&
      style.marginRight === "auto" &&
      style.width.endsWith("px") &&
      style.height.endsWith("px")
    ) {
      return element;
    }
  }
  return null;
}

export class TouchSelectionView {
  public readonly overlay = document.createElement("div");
  public readonly handles: Record<Endpoint, TouchHandle>;
  public scroller: HTMLElement | null = null;
  public viewport: HTMLElement | null = null;
  readonly #style = document.createElement("style");

  public constructor(private readonly root: ShadowRoot) {
    this.overlay.dataset["readerPdfHandles"] = "";
    this.overlay.hidden = true;
    this.overlay.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:30;overflow:visible;";
    this.#style.textContent = handleCss;
    root.append(this.#style);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    this.overlay.append(svg);
    this.handles = { start: this.#createHandle(svg), end: this.#createHandle(svg) };
  }

  public attach(): boolean {
    // This runs for every selection update. Reuse the content box instead of scanning
    // potentially hundreds of styled PDF/annotation nodes on each pointer frame.
    if (this.scroller?.isConnected && this.root.contains(this.scroller)) {
      return true;
    }
    const next = findPdfScroller(this.root);
    if (!next) {
      this.overlay.hidden = true;
      return false;
    }
    if (next !== this.scroller) {
      this.scroller = next;
      this.viewport = next.parentElement;
      while (
        this.viewport &&
        !["auto", "scroll"].includes(getComputedStyle(this.viewport).overflowY)
      ) {
        this.viewport = this.viewport.parentElement;
      }
      next.append(this.overlay);
    }
    return true;
  }

  public endpoint(event: Event): Endpoint | null {
    const path = event.composedPath();
    return path.includes(this.handles.start.button)
      ? "start"
      : path.includes(this.handles.end.button)
        ? "end"
        : null;
  }

  public place(
    end: Endpoint,
    rect: Rect | null,
    toScroller: (point: Position) => Position | null,
  ): void {
    const handle = this.handles[end];
    if (!rect) {
      hideHandle(handle);
      return;
    }
    const x = rect.origin.x + (end === "end" ? rect.size.width : 0);
    const top = toScroller({ x, y: rect.origin.y });
    const bottom = toScroller({ x, y: rect.origin.y + rect.size.height });
    const centre = toScroller({
      x: rect.origin.x + rect.size.width / 2,
      y: rect.origin.y + rect.size.height / 2,
    });
    if (!top || !bottom || !centre) {
      hideHandle(handle);
      return;
    }
    handle.focus = centre;
    const length = Math.hypot(bottom.x - top.x, bottom.y - top.y) || 1;
    const sign = end === "start" ? -1 : 1;
    const tip = end === "start" ? top : bottom;
    const knob = {
      x: tip.x + (sign * 9 * (bottom.x - top.x)) / length,
      y: tip.y + (sign * 9 * (bottom.y - top.y)) / length,
    };
    handle.button.style.left = `${String(knob.x)}px`;
    handle.button.style.top = `${String(knob.y)}px`;
    handle.button.hidden = false;
    handle.button.dataset["readerPdfHandle"] = end;
    handle.button.setAttribute("aria-label", `Adjust selection ${end}`);
    handle.button.title = `Drag to adjust selection ${end}; arrow keys move one character`;
    handle.stem.style.display = "";
    for (const [key, value] of Object.entries({
      x1: top.x,
      y1: top.y,
      x2: bottom.x,
      y2: bottom.y,
    })) {
      handle.stem.setAttribute(key, String(value));
    }
  }

  public destroy(): void {
    this.overlay.remove();
    this.#style.remove();
  }

  #createHandle(svg: SVGSVGElement): TouchHandle {
    const button = document.createElement("button");
    button.type = "button";
    const stem = document.createElementNS("http://www.w3.org/2000/svg", "line");
    svg.append(stem);
    this.overlay.append(button);
    return { button, stem, focus: { x: 0, y: 0 } };
  }
}

function hideHandle(handle: TouchHandle): void {
  handle.button.hidden = true;
  handle.stem.style.display = "none";
}

const handleCss = `
[data-reader-pdf-handles] button { position:absolute; width:44px; height:44px; padding:0;
  border:0; background:transparent; touch-action:none; user-select:none; -webkit-user-select:none;
  pointer-events:auto; cursor:grab; transform:translate(-50%,-50%); border-radius:50%; }
[data-reader-pdf-handles] button::after { content:""; position:absolute; inset:14px;
  border-radius:50%; background:#2563eb; box-shadow:0 0 0 1.5px white,0 1px 4px #0005; }
[data-reader-pdf-handles] button:focus-visible { outline:2px solid #2563eb; outline-offset:0; }
[data-reader-pdf-handles] button[data-dragging] { cursor:grabbing; }
[data-reader-pdf-handles] button[data-dragging]::after { inset:12px; }
[data-reader-pdf-handles] svg { position:absolute; inset:0; overflow:visible; pointer-events:none; }
[data-reader-pdf-handles] line { stroke:#2563eb; stroke-width:2; }
@media (forced-colors:active) {
  [data-reader-pdf-handles] button::after { background:Highlight; forced-color-adjust:none; }
  [data-reader-pdf-handles] line { stroke:Highlight; forced-color-adjust:none; }
}
`;
