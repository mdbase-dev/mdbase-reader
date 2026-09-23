import { Locator, LocatorLocations, LocatorText } from "@readium/shared";

import { epubSelectionEvidence } from "./epub-cfi.js";
import { stableEpubHref, stableReadiumLocator } from "./epub-locator.js";

import type { TextSelectionDraft, ViewportRect } from "@mdbase-reader/reading-surface";
import type { EpubNavigatorListeners } from "@readium/navigator";
import type { Publication } from "@readium/shared";

type ReadiumTextSelection = Parameters<EpubNavigatorListeners["textSelected"]>[0];

export function readiumSelectionToDraft(input: {
  readonly text: string;
  readonly targetFrameSrc: string;
  readonly locator?: Locator;
  readonly publicationBaseUrl: string;
  readonly cfi?: string;
  readonly prefix?: string;
  readonly suffix?: string;
}): TextSelectionDraft {
  const serialized = input.locator
    ? stableReadiumLocator(input.locator, input.publicationBaseUrl)
    : {
        href: stableEpubHref(input.targetFrameSrc, input.publicationBaseUrl),
        type: "application/xhtml+xml",
      };
  const cfi = input.cfi ?? input.locator?.locations.fragments[0];
  const prefix = input.prefix ?? input.locator?.text?.before;
  const suffix = input.suffix ?? input.locator?.text?.after;
  return {
    target: {
      quote: {
        exact: input.text,
        ...(prefix ? { prefix } : {}),
        ...(suffix ? { suffix } : {}),
      },
      ...(cfi ? { epub: { cfi } } : {}),
    },
    locator: { kind: "epub", locator: serialized },
  };
}

export function selectedTextDraft(input: {
  readonly selection: ReadiumTextSelection;
  readonly publication: Publication;
  readonly container: HTMLElement;
  readonly publicationBaseUrl: string;
}): TextSelectionDraft {
  const { selection } = input;
  const readingOrderIndex = selection.locator
    ? input.publication.readingOrder.findIndexWithHref(selection.locator.href)
    : -1;
  const range = frameSelectionRange(input.container, selection.targetFrameSrc);
  const evidence = range ? epubSelectionEvidence(range.range, readingOrderIndex) : null;
  const locator =
    selection.locator && evidence
      ? new Locator({
          href: selection.locator.href,
          type: selection.locator.type,
          ...(selection.locator.title ? { title: selection.locator.title } : {}),
          locations: new LocatorLocations({ fragments: [evidence.cfi] }),
          text: new LocatorText({
            highlight: selection.text,
            ...(evidence.prefix ? { before: evidence.prefix } : {}),
            ...(evidence.suffix ? { after: evidence.suffix } : {}),
          }),
        })
      : selection.locator;
  const draft = readiumSelectionToDraft({
    ...selection,
    ...(locator ? { locator } : {}),
    publicationBaseUrl: input.publicationBaseUrl,
    ...(evidence ?? {}),
  });
  return range ? { ...draft, anchor: viewportRect(range.frame, range.range) } : draft;
}

function frameSelectionRange(
  container: HTMLElement,
  targetFrameSrc: string,
): { readonly frame: HTMLIFrameElement; readonly range: Range } | null {
  const frame = [
    ...container.querySelectorAll<HTMLIFrameElement>(".readium-navigator-iframe"),
  ].find((candidate) => candidate.contentWindow?.location.href === targetFrameSrc);
  const selection = frame?.contentWindow?.getSelection();
  return frame && selection && selection.rangeCount > 0
    ? { frame, range: selection.getRangeAt(0) }
    : null;
}

/** Converts a range inside a Readium frame to the parent window's viewport. */
function viewportRect(frame: HTMLIFrameElement, range: Range): ViewportRect {
  const inner = range.getBoundingClientRect();
  const outer = frame.getBoundingClientRect();
  // Fixed-layout frames may be scaled with a transform.
  const scaleX = frame.offsetWidth ? outer.width / frame.offsetWidth : 1;
  const scaleY = frame.offsetHeight ? outer.height / frame.offsetHeight : 1;
  return {
    x: outer.left + inner.left * scaleX,
    y: outer.top + inner.top * scaleY,
    width: inner.width * scaleX,
    height: inner.height * scaleY,
  };
}
