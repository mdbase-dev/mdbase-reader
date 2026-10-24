/** Draws annotations with the CSS Custom Highlight API where the browser supports it. */

import {
  highlightColorKeys,
  highlightColorSpec,
  highlightPalette,
  normalizeHighlightColor,
  type HighlightShade,
} from "@mdbase-reader/core";

interface HighlightRegistry {
  set(name: string, value: unknown): void;
  delete(name: string): void;
}

type HighlightWindow = Window & {
  readonly Highlight?: new (...ranges: Range[]) => unknown;
  readonly CSS?: { readonly highlights?: HighlightRegistry };
};

export const activeAnnotationHighlight = "reader-active-annotation";

/**
 * One named highlight per colour, since a highlight's style applies to all its ranges: the five
 * palette colours, plus one per hex colour another app stored.
 */
export function annotationHighlightName(color: string | undefined): string {
  const normalized = normalizeHighlightColor(color);
  return normalized.startsWith("#")
    ? `reader-annotation-hex-${normalized.slice(1)}`
    : `reader-annotation-${normalized}`;
}

function highlightRule(name: string, shade: HighlightShade, opacity: number): string {
  const wash =
    opacity < 1
      ? `color-mix(in srgb, ${shade.wash} ${String(Math.round(opacity * 100))}%, transparent)`
      : shade.wash;
  // The faint underline in the colour's ink says "highlighted" without relying on the wash alone.
  return `::highlight(${name}) { background-color: ${wash}; text-decoration: underline 1px color-mix(in srgb, ${shade.ink} 60%, transparent); text-underline-offset: .2em; }`;
}

/**
 * The palette's washes for the page's light and dark schemes, the active annotation's underline,
 * and a forced-colours fallback. Body text stays at least 12:1 on light washes and 7:1 on dark.
 */
export function annotationHighlightCss(): string {
  const names = highlightColorKeys.map((key) => annotationHighlightName(key));
  return [
    ...highlightColorKeys.map((key) =>
      highlightRule(annotationHighlightName(key), highlightPalette[key].light, 1),
    ),
    ...highlightColorKeys.map(
      (key) =>
        `:root[data-reader-scheme="dark"] ${highlightRule(annotationHighlightName(key), highlightPalette[key].dark, 1)}`,
    ),
    `::highlight(${activeAnnotationHighlight}) { text-decoration: underline 2px currentColor; text-underline-offset: .2em; }`,
    `@media (forced-colors: active) { ${names.map((name) => `::highlight(${name}) { background-color: Mark; color: MarkText; }`).join(" ")} }`,
  ].join("\n");
}

const registered = new WeakMap<Window, Set<string>>();

/** Replaces the page's annotation highlights, grouping ranges by colour. */
export function setAnnotationHighlights(
  view: Window,
  entries: readonly { readonly color?: string | undefined; readonly range: Range }[],
): void {
  const groups = new Map<string, { color: string | undefined; ranges: Range[] }>();
  for (const { color, range } of entries) {
    const name = annotationHighlightName(color);
    const group = groups.get(name) ?? { color, ranges: [] };
    group.ranges.push(range);
    groups.set(name, group);
  }
  const previous = registered.get(view) ?? new Set<string>();
  for (const name of previous) {
    if (!groups.has(name)) {
      setCssHighlight(view, name, []);
    }
  }
  for (const [name, { ranges }] of groups) {
    setCssHighlight(view, name, ranges);
  }
  registered.set(view, new Set(groups.keys()));
  writeCustomColorRules(
    view.document,
    [...groups.entries()].filter(([name]) => name.startsWith("reader-annotation-hex-")),
  );
}

/** Hex colours outside the palette get their rules at runtime, translucent as they always were. */
function writeCustomColorRules(
  document: Document,
  groups: readonly (readonly [string, { readonly color: string | undefined }])[],
): void {
  let style = document.head.querySelector<HTMLStyleElement>(
    "style[data-mdbase-reader='custom-highlights']",
  );
  if (!style && groups.length === 0) {
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.dataset["mdbaseReader"] = "custom-highlights";
    document.head.append(style);
  }
  style.textContent = groups
    .map(([name, { color }]) => {
      const spec = highlightColorSpec(color);
      return highlightRule(name, spec.light, spec.washOpacity);
    })
    .join("\n");
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
  for (const name of registered.get(view) ?? []) {
    highlights?.delete(name);
  }
  registered.delete(view);
  highlights?.delete(activeAnnotationHighlight);
}
