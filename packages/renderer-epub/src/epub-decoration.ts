import { DecorationStyleType, type Decoration } from "@readium/navigator";

import { sessionReadiumLocatorForPublication } from "./epub-locator.js";

import type { Annotation } from "@mdbase-reader/core";
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
          tint: highlightTint(annotation.color),
        },
      }
    : null;
}

function highlightTint(color: string | undefined): string {
  switch (color?.toLowerCase()) {
    case "blue":
      return "#8ec5ff";
    case "green":
      return "#9de2b0";
    case "pink":
      return "#f3a6c8";
    case "purple":
      return "#c7a7f3";
    default:
      return "#f2cf63";
  }
}
