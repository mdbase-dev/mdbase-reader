import type { AnnotationId } from "@mdbase-reader/core";

export interface MarginMarkerRange {
  readonly id: AnnotationId;
  readonly range: Range;
  readonly hasNote: boolean;
}

/**
 * Draws a bar in the left margin beside each annotated passage, so highlights stay findable
 * when the eye is on the text. Markers live outside `<body>`, so they never enter the text that
 * selectors are resolved against.
 */
export class HtmlMarginMarkers {
  readonly #document: Document;
  readonly #layer: HTMLElement;
  #ranges: readonly MarginMarkerRange[] = [];
  #activeId: AnnotationId | null = null;

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
    const body = this.#document.body;
    const view = this.#document.defaultView;
    if (!view) {
      return;
    }
    const scrollY = view.scrollY;
    const left = Math.max(8, body.getBoundingClientRect().left + bodyPaddingLeft(body) - 22);
    const markers = this.#ranges.flatMap(({ id, range, hasNote }) => {
      const rects = [...range.getClientRects()].filter(({ height }) => height > 0);
      const first = rects[0];
      const last = rects.at(-1);
      if (!first || !last) {
        return [];
      }
      const marker = this.#document.createElement("span");
      marker.dataset["annotation"] = id;
      marker.className = `${hasNote ? "has-note" : ""}${id === this.#activeId ? " is-active" : ""}`;
      marker.style.top = `${String(first.top + scrollY)}px`;
      marker.style.height = `${String(Math.max(12, last.bottom - first.top))}px`;
      marker.style.left = `${String(left)}px`;
      marker.title = hasNote ? "Highlight with a note" : "Highlight";
      return [marker];
    });
    this.#layer.replaceChildren(...markers);
  }

  public destroy(): void {
    this.#layer.remove();
    this.#ranges = [];
  }
}

function bodyPaddingLeft(body: HTMLElement): number {
  const value = body.ownerDocument.defaultView?.getComputedStyle(body).paddingLeft ?? "0";
  return Number.parseFloat(value) || 0;
}
