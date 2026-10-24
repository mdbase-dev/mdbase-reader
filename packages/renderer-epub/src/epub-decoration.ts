import { highlightColorSpec, type Annotation } from "@mdbase-reader/core";
import { DecorationStyleType, type Decoration, type EpubNavigator } from "@readium/navigator";

import { sessionReadiumLocatorForPublication } from "./epub-locator.js";

import type { Publication } from "@readium/shared";

export function annotationToEpubDecoration(
  annotation: Annotation,
  publication: Publication,
  publicationBaseUrl: string,
  active = false,
): Decoration | null {
  const selector = annotation.target?.epub;
  if (!selector) {
    return null;
  }
  const locator = sessionReadiumLocatorForPublication(
    {
      type: "application/xhtml+xml",
      locations: { fragments: [selector.cfi] },
      ...(annotation.target.quote
        ? {
            text: {
              highlight: annotation.target.quote.exact,
              ...(annotation.target.quote.prefix ? { before: annotation.target.quote.prefix } : {}),
              ...(annotation.target.quote.suffix ? { after: annotation.target.quote.suffix } : {}),
            },
          }
        : {}),
    },
    publication,
    publicationBaseUrl,
  );
  return locator
    ? {
        id: annotation.id,
        locator,
        style: {
          type: active ? DecorationStyleType.HighlightUnderline : DecorationStyleType.Highlight,
          tint: epubHighlightTint(annotation.color, active),
        },
      }
    : null;
}

/**
 * EPUB pages keep Readium's light paper, so they take the light shades: the wash behind text,
 * and for the active annotation the ink, which Readium draws as an underline over a faint tint.
 */
export function epubHighlightTint(color: string | undefined, active = false): string {
  const shade = highlightColorSpec(color).light;
  return active ? shade.ink : shade.wash;
}

/** Annotation highlights, as one Readium decoration group. */
export function applyAnnotationDecorations(
  navigator: Pick<EpubNavigator, "applyDecorations">,
  annotations: readonly Annotation[],
  publication: Publication,
  publicationBaseUrl: string,
): void {
  navigator.applyDecorations(
    annotations.flatMap((annotation) => {
      const decoration = annotationToEpubDecoration(annotation, publication, publicationBaseUrl);
      return decoration ? [decoration] : [];
    }),
    "mdbase-reader-annotations",
  );
}
