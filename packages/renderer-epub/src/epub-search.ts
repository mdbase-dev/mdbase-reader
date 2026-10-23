import { locateSearchQuote } from "@mdbase-reader/reading-surface";
import { DecorationStyleType } from "@readium/navigator";

import { sessionReadiumLocatorForPublication } from "./epub-locator.js";
import {
  extractPublicationSearchSegments,
  resolvePublicationSearchDestination,
} from "./epub-text.js";

import type { ReadiumRuntime } from "./readium-runtime.js";
import type { EpubNavigator } from "@readium/navigator";
import type { Publication } from "@readium/shared";

/** Readium's general go() reports success even when its text fallback misses.
 * Use the frame's explicit go_text acknowledgement, never that permissive fallback. */
export function createEpubSearch(
  navigator: EpubNavigator,
  publication: Publication,
  publicationBaseUrl: string,
  settle: () => void,
): Pick<ReadiumRuntime, "extractSearchSegments" | "goToSearchDestination" | "clearSearch"> {
  let generation = 0;
  const clearSearch = (): void => {
    generation++;
    navigator.applyDecorations([], "mdbase-reader-search-passage");
  };
  return {
    extractSearchSegments: (options) =>
      extractPublicationSearchSegments(publication, publicationBaseUrl, options?.signal),
    async goToSearchDestination(destination) {
      const request = ++generation;
      const resolved = await resolvePublicationSearchDestination(
        publication,
        publicationBaseUrl,
        destination,
      );
      const locator = resolved
        ? sessionReadiumLocatorForPublication(resolved, publication, publicationBaseUrl)
        : null;
      if (!locator || request !== generation) {
        return false;
      }
      const previous = navigator.currentLocator;
      settle();
      // Open only the verified spine item first; a frame acknowledgement below proves the passage.
      const start = sessionReadiumLocatorForPublication(
        { href: locator.href, type: locator.type },
        publication,
        publicationBaseUrl,
      );
      if (
        !start ||
        !(await new Promise<boolean>((resolve) => navigator.go(start, false, resolve)))
      ) {
        return false;
      }
      const frame = navigator.pool.currentFrames.find((item, index) => {
        const document = item?.iframe.contentDocument;
        return (
          navigator.viewport.readingOrder[index] === locator.href &&
          document?.body &&
          locateSearchQuote(document.body, destination.quote)
        );
      });
      const document = frame?.iframe.contentDocument;
      // Readium uses a different quote matcher. When its native text-only selector could
      // choose a repeat, refuse instead of substituting the first occurrence.
      const range = document?.body
        ? locateSearchQuote(document.body, { exact: destination.quote.exact })
        : null;
      const moved =
        frame?.msg && range
          ? await new Promise<boolean>((resolve) =>
              frame.msg?.send("go_text", locator.text?.serialize(), resolve),
            )
          : false;
      if (request !== generation) {
        return false;
      }
      if (!moved) {
        await new Promise<boolean>((resolve) => navigator.go(previous, false, resolve));
        return false;
      }
      navigator.applyDecorations(
        [
          {
            id: "search-passage",
            locator,
            style: { type: DecorationStyleType.HighlightUnderline, tint: "#f2cf63" },
          },
        ],
        "mdbase-reader-search-passage",
      );
      frame?.iframe.focus();
      return true;
    },
    clearSearch,
  };
}
