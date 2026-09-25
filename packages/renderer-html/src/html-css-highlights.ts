/** Draws annotations with the CSS Custom Highlight API where the browser supports it. */

interface HighlightRegistry {
  set(name: string, value: unknown): void;
  delete(name: string): void;
}

type HighlightWindow = Window & {
  readonly Highlight?: new (...ranges: Range[]) => unknown;
  readonly CSS?: { readonly highlights?: HighlightRegistry };
};

export function setCssHighlights(view: Window, ranges: readonly Range[]): void {
  setCssHighlight(view, "reader-annotations", ranges);
}

export function setCssHighlight(view: Window, name: string, ranges: readonly Range[]): void {
  const target = view as HighlightWindow;
  const registry = target.CSS?.highlights;
  const Highlight = target.Highlight;
  if (!registry || !Highlight) {
    return;
  }
  registry.delete(name);
  if (ranges.length > 0) {
    registry.set(name, new Highlight(...ranges));
  }
}

export function clearCssHighlights(view: Window): void {
  const highlights = (view as HighlightWindow).CSS?.highlights;
  highlights?.delete("reader-annotations");
  highlights?.delete("reader-active-annotation");
}
