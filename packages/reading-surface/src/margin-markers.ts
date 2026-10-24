import { highlightColorSpec, type AnnotationId } from "@mdbase-reader/core";

export interface MarginMarkerRange {
  readonly id: AnnotationId;
  readonly range: Range;
  readonly hasNote: boolean;
  /** The annotation's stored colour; the bar takes its ink. Missing means yellow. */
  readonly color?: string | undefined;
}

/**
 * Draws a bar in the margin beside each annotated passage, so highlights stay findable when the
 * eye is on the text. Markers live outside `<body>`, so they never enter the text that selectors
 * are resolved against, and carry their own stylesheet, since EPUB frames have no Reader styles.
 */
export class MarginMarkers {
  readonly #document: Document;
  readonly #layer: HTMLElement;
  #ranges: readonly MarginMarkerRange[] = [];
  #activeId: AnnotationId | null = null;
  #positions: { id: AnnotationId; x: number; y: number }[] = [];
  #layoutScale = 1;

  public constructor(document: Document, onActivate: (id: AnnotationId) => void) {
    this.#document = document;
    this.#layer = document.createElement("div");
    this.#layer.dataset["mdbaseReader"] = "margin";
    this.#layer.setAttribute("aria-hidden", "true");
    this.#layer.addEventListener("click", (event) => {
      const marker = (event.target as Element | null)?.closest<HTMLElement>("[data-annotation]");
      const id = marker?.dataset["annotation"];
      if (id) {
        event.preventDefault();
        onActivate(id as AnnotationId);
      }
    });
    document.documentElement.append(this.#layer);
    if (!document.querySelector("style[data-mdbase-reader='margin-style']")) {
      const style = document.createElement("style");
      style.dataset["mdbaseReader"] = "margin-style";
      style.textContent = marginStyles;
      document.head.append(style);
    }
  }

  public set(ranges: readonly MarginMarkerRange[]): void {
    this.#ranges = ranges;
    this.layout();
  }

  public setActive(id: AnnotationId | null): void {
    this.#activeId = id;
    for (const marker of this.#layer.children) {
      marker.classList.toggle(
        "is-active",
        (marker as HTMLElement).dataset["annotation"] === (id ?? ""),
      );
    }
  }

  /** Recomputes marker positions after the text reflows. */
  public layout(): void {
    if (!this.#document.defaultView) {
      return;
    }
    // Measure from the layer itself: EPUB frames offset and zoom the root element, so viewport
    // coordinates are converted into the layer's own positioning space.
    const origin = this.#layer.getBoundingClientRect();
    const scale = this.#scale();
    this.#layoutScale = scale;
    this.#positions = [];
    const markers = this.#ranges.flatMap(({ id, range, hasNote, color }) => {
      const rects = [...range.getClientRects()].filter(({ height }) => height > 0);
      const first = rects[0];
      const last = rects.at(-1);
      if (!first || !last) {
        return [];
      }
      // Beside the passage's own block, so indents and paginated columns keep it close.
      const block = blockAncestor(range.startContainer);
      const edge = block ? block.getBoundingClientRect().left : first.left;
      this.#positions.push({
        id,
        x: (first.left - origin.left) / scale,
        y: (first.top - origin.top) / scale,
      });
      const marker = this.#document.createElement("span");
      marker.dataset["annotation"] = id;
      marker.className = `${hasNote ? "has-note" : ""}${id === this.#activeId ? " is-active" : ""}`;
      marker.style.top = `${String((first.top - origin.top) / scale)}px`;
      marker.style.height = `${String(Math.max(12, (last.bottom - first.top) / scale))}px`;
      marker.style.left = `${String(Math.max(4, (edge - origin.left) / scale - 14))}px`;
      marker.title = hasNote ? "Highlight with a note" : "Highlight";
      const ink = highlightColorSpec(color);
      marker.style.setProperty("--mdbase-marker", ink.light.ink);
      marker.style.setProperty("--mdbase-marker-dark", ink.dark.ink);
      return [marker];
    });
    this.#layer.replaceChildren(...markers);
  }

  /** Reuses layout's coordinates: one geometry read, not thousands of Range reads per scroll. */
  public nearest(): AnnotationId | null {
    const view = this.#document.defaultView;
    if (!view) {
      return null;
    }
    const origin = this.#layer.getBoundingClientRect();
    const x = (view.innerWidth / 2 - origin.left) / this.#layoutScale;
    const y = (Math.min(40, view.innerHeight / 10) - origin.top) / this.#layoutScale;
    let nearest: AnnotationId | null = null;
    let distance = Infinity;
    for (const point of this.#positions) {
      const next = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (next < distance) {
        nearest = point.id;
        distance = next;
      }
    }
    return nearest;
  }

  /** Rendered pixels per CSS pixel inside the layer, e.g. under a zoomed root. */
  #scale(): number {
    const probe = this.#document.createElement("i");
    probe.style.cssText = "position:absolute;visibility:hidden;width:100px;height:0";
    this.#layer.append(probe);
    const scale = probe.getBoundingClientRect().width / 100;
    probe.remove();
    return scale > 0 ? scale : 1;
  }

  public destroy(): void {
    this.#layer.remove();
    this.#ranges = [];
    this.#positions = [];
  }
}

function blockAncestor(node: Node): Element | null {
  let element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const view = node.ownerDocument?.defaultView;
  while (element && view) {
    const display = view.getComputedStyle(element).display;
    if (display !== "inline" && display !== "contents") {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

// The bar takes its highlight's ink: translucent at rest, solid with a note or when active. A page
// that follows a dark theme marks its root with data-reader-scheme="dark" and takes the dark ink.
const marginStyles = `
html { position: relative; }
[data-mdbase-reader="margin"] { position: absolute; inset: 0 auto auto 0; width: 0; height: 0; z-index: 2; }
[data-mdbase-reader="margin"] > span { --ink: var(--mdbase-marker, #e0a61e); position: absolute; width: 3px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 60%, transparent); cursor: pointer; transition: background .15s, width .15s, transform .15s; }
:root[data-reader-scheme="dark"] [data-mdbase-reader="margin"] > span { --ink: var(--mdbase-marker-dark, #edc14d); }
[data-mdbase-reader="margin"] > span::after { content: ""; position: absolute; inset: -2px -8px; }
[data-mdbase-reader="margin"] > span.has-note { background: var(--ink); }
[data-mdbase-reader="margin"] > span:hover, [data-mdbase-reader="margin"] > span.is-active { width: 4px; transform: translateX(-.5px); background: var(--ink); }
@media (prefers-reduced-motion: reduce) { [data-mdbase-reader="margin"] > span { transition: none; } }
@media (forced-colors: active) { [data-mdbase-reader="margin"] > span { background: Highlight; } }
`;
