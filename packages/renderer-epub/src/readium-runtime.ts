import {
  createEventEmitter,
  pageMotionTracker,
  readingMeasureCharacters,
} from "@mdbase-reader/reading-surface";
import { EpubNavigator, EpubPreferences, type EpubNavigatorListeners } from "@readium/navigator";
import {
  HttpFetcher,
  Locator,
  LocatorLocations,
  LocatorText,
  Manifest,
  Publication,
} from "@readium/shared";

import { createEpubAnnotationActivations } from "./epub-annotation-activation.js";
import { annotationToEpubDecoration, applyAnnotationDecorations } from "./epub-decoration.js";
import { EpubFrameEnhancements, clearFrameSelections } from "./epub-frames.js";
import { sessionReadiumLocatorForPublication, stableReadiumLocator } from "./epub-locator.js";
import { safePublicationFetch } from "./epub-safe-fetch.js";
import { extractPublicationText } from "./epub-text.js";
import { selectedTextDraft } from "./readium-selection.js";

import type { Annotation, AnnotationId } from "@mdbase-reader/core";
import type {
  ContentsEntry,
  ReadingMotion,
  ReadingTypography,
  TextSelectionDraft,
  Unsubscribe,
} from "@mdbase-reader/reading-surface";
import type { Link } from "@readium/shared";

export interface ReadiumRuntime {
  currentLocator(): Readonly<Record<string, unknown>>;
  goTo(locator: Readonly<Record<string, unknown>>): Promise<boolean>;
  goPage?(direction: -1 | 1): Promise<boolean>;
  contents?(): readonly ContentsEntry[];
  goToContents?(id: string): Promise<boolean>;
  clearSelection(): void;
  extractText(options?: { readonly signal?: AbortSignal }): Promise<string>;
  onLocationChanged(listener: (locator: Readonly<Record<string, unknown>>) => void): Unsubscribe;
  onTextSelected(listener: (selection: TextSelectionDraft) => void): Unsubscribe;
  onSelectionCleared?(listener: () => void): Unsubscribe;
  onMotion?(listener: (motion: ReadingMotion) => void): Unsubscribe;
  onAnnotationActivated(listener: (annotationId: AnnotationId) => void): Unsubscribe;
  setAnnotations(annotations: readonly Annotation[]): void;
  setActiveAnnotation(annotation: Annotation | null): void;
  setTypography(typography: ReadingTypography): Promise<void>;
  destroy(): Promise<void>;
}

export { readiumSelectionToDraft } from "./readium-selection.js";

function objectValue(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Readium returned an invalid ${name}.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function serializeReadiumLocator(locator: Locator): Readonly<Record<string, unknown>> {
  const serialized: unknown = locator.serialize();
  return objectValue(serialized, "locator");
}

const readerEpubDefaults = {
  fontSize: 1.125,
  lineHeight: 1.7,
  paragraphSpacing: 0.75,
  paragraphIndent: 0,
  columnCount: 1,
  pageGutter: 32,
  optimalLineLength: 65,
};

export async function createReadiumRuntime(input: {
  readonly container: HTMLElement;
  readonly manifest: unknown;
  readonly publicationBaseUrl: string;
  readonly initialLocator?: Readonly<Record<string, unknown>>;
}): Promise<ReadiumRuntime> {
  const publication = readiumPublication(input.manifest);
  const locationListeners = new Set<(locator: Readonly<Record<string, unknown>>) => void>();
  const { listeners: selectionListeners, emit: emitSelection } = selectionReporter(
    input,
    publication,
  );
  const motions = createEventEmitter<ReadingMotion>();
  const trackMotion = pageMotionTracker((motion) => motions.emit(motion));
  const positions = publicationPositions(publication);
  if (positions.length === 0) {
    throw new Error("Readium cannot open an EPUB with an empty reading order.");
  }
  const requestedLocator = input.initialLocator
    ? sessionReadiumLocatorForPublication(
        input.initialLocator,
        publication,
        input.publicationBaseUrl,
      )
    : null;
  const initialLocator =
    requestedLocator && publication.readingOrder.findWithHref(requestedLocator.href)
      ? requestedLocator
      : positions[0];

  const listeners: EpubNavigatorListeners = {
    frameLoaded: () => undefined,
    positionChanged: (locator) => {
      const serialized = stableReadiumLocator(locator, input.publicationBaseUrl);
      // Readium counts positions from 1; the first page is the start.
      trackMotion((locator.locations.position ?? 1) - 1);
      for (const listener of locationListeners) {
        listener(serialized);
      }
    },
    timelineItemChanged: () => undefined,
    tap: () => false,
    click: () => false,
    zoom: () => undefined,
    miscPointer: () => undefined,
    scroll: () => undefined,
    customEvent: () => undefined,
    handleLocator: () => false,
    textSelected: (selection) => emitSelection(selection),
    contentProtection: () => undefined,
    contextMenu: () => undefined,
    peripheral: () => undefined,
  };
  const navigator = new EpubNavigator(
    input.container,
    publication,
    listeners,
    positions,
    initialLocator,
    { preferences: {}, defaults: readerEpubDefaults },
  );
  await navigator.load();
  const annotationActivations = createEpubAnnotationActivations(navigator);
  // Readium reports selections only on pointer release; the frames report the rest as they settle.
  const frames = new EpubFrameEnhancements(input.container, (document, via) => {
    const selection = settledFrameSelection(navigator, publication, document);
    if (selection) {
      emitSelection(selection, via);
    }
  });

  return {
    currentLocator: () => stableReadiumLocator(navigator.currentLocator, input.publicationBaseUrl),
    goTo(locator) {
      const destination = sessionReadiumLocatorForPublication(
        locator,
        publication,
        input.publicationBaseUrl,
      );
      if (!destination) {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => navigator.go(destination, false, resolve));
    },
    ...sectionNavigation(publication, navigator),
    clearSelection: () => clearFrameSelections(input.container),
    extractText: (options) => extractPublicationText(publication, options?.signal),
    onLocationChanged(listener) {
      locationListeners.add(listener);
      return () => locationListeners.delete(listener);
    },
    onTextSelected(listener) {
      selectionListeners.add(listener);
      return () => selectionListeners.delete(listener);
    },
    onSelectionCleared: (listener) => frames.onSelectionCleared(listener),
    onMotion: (listener) => motions.subscribe(listener),
    onAnnotationActivated(listener) {
      const stops = [annotationActivations.subscribe(listener), frames.onActivated(listener)];
      return () => stops.forEach((stop) => stop());
    },
    setAnnotations(annotations) {
      applyAnnotationDecorations(navigator, annotations, publication, input.publicationBaseUrl);
      frames.setAnnotations(annotations);
    },
    setActiveAnnotation(annotation) {
      const decoration = annotation
        ? annotationToEpubDecoration(annotation, publication, input.publicationBaseUrl, true)
        : null;
      navigator.applyDecorations(decoration ? [decoration] : [], "mdbase-reader-active-annotation");
      frames.setActive(decoration && annotation ? annotation.id : null);
    },
    setTypography: (typography) => navigator.submitPreferences(epubPreferences(typography)),
    async destroy() {
      locationListeners.clear();
      selectionListeners.clear();
      motions.clear();
      annotationActivations.destroy();
      frames.destroy();
      await navigator.destroy();
    },
  };
}

type ReadiumTextSelection = Parameters<EpubNavigatorListeners["textSelected"]>[0];

/** Turns Readium's selections into drafts for each listener, noting how they were made. */
function selectionReporter(
  input: { readonly container: HTMLElement; readonly publicationBaseUrl: string },
  publication: Publication,
): {
  readonly listeners: Set<(selection: TextSelectionDraft) => void>;
  readonly emit: (selection: ReadiumTextSelection, via?: "keyboard" | "touch") => void;
} {
  const listeners = new Set<(selection: TextSelectionDraft) => void>();
  return {
    listeners,
    emit: (selection, via) => {
      const draft = selectedTextDraft({
        selection,
        publication,
        container: input.container,
        publicationBaseUrl: input.publicationBaseUrl,
      });
      for (const listener of listeners) {
        listener(via ? { ...draft, via } : draft);
      }
    },
  };
}

/** The selection in one of Readium's frames, shaped as Readium reports it on release. */
function settledFrameSelection(
  navigator: EpubNavigator,
  publication: Publication,
  document: Document,
): ReadiumTextSelection | null {
  const view = document.defaultView;
  const selection = view?.getSelection();
  const text = selection?.toString() ?? "";
  if (!view || !selection || selection.rangeCount === 0 || !text) {
    return null;
  }
  const rect = selection.getRangeAt(0).getClientRects()[0] ?? new DOMRect();
  const locator = frameLocator(navigator, publication, document, text);
  return {
    text,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    targetFrameSrc: view.location.href,
    ...(locator ? { locator } : {}),
  };
}

/** Locates text in a frame by the reading-order item the frame shows, as Readium does. */
function frameLocator(
  navigator: EpubNavigator,
  publication: Publication,
  document: Document,
  text: string,
): Locator | null {
  const index = navigator.pool.currentFrames.findIndex(
    (frame) => frame?.iframe.contentDocument === document,
  );
  const href = index >= 0 ? navigator.viewport.readingOrder[index] : undefined;
  if (!href) {
    return null;
  }
  return new Locator({
    href,
    type: publication.readingOrder.findWithHref(href)?.type ?? "application/xhtml+xml",
    text: new LocatorText({ highlight: text }),
  });
}

function epubPreferences(typography: ReadingTypography): EpubPreferences {
  return new EpubPreferences({
    fontSize: readerEpubDefaults.fontSize * Math.max(0.8, Math.min(1.6, typography.scale)),
    optimalLineLength: readingMeasureCharacters[typography.measure],
    fontFamily: typography.face === "sans" ? "sans-serif" : null,
  });
}

function readiumPublication(value: unknown): Publication {
  const manifest = Manifest.deserialize(value);
  if (!manifest) {
    throw new Error("Readium could not parse the publication manifest.");
  }
  return new Publication({ manifest, fetcher: new HttpFetcher(safePublicationFetch) });
}

export function publicationPositions(publication: Publication): Locator[] {
  const items = publication.readingOrder.items;
  return items.map(
    (link, index) =>
      new Locator({
        href: link.href,
        type: link.type ?? "application/xhtml+xml",
        ...(link.title ? { title: link.title } : {}),
        locations: new LocatorLocations({
          position: index + 1,
          progression: 0,
          totalProgression: items.length === 1 ? 0 : index / (items.length - 1),
        }),
      }),
  );
}

/** Page turns and the publication's own table of contents. */
function sectionNavigation(
  publication: Publication,
  navigator: EpubNavigator,
): Pick<ReadiumRuntime, "goPage" | "contents" | "goToContents"> {
  const contents = flattenContents(publication.toc?.items ?? []);
  return {
    goPage: (direction) =>
      new Promise((resolve) =>
        navigator[direction === 1 ? "goForward" : "goBackward"](false, resolve),
      ),
    contents: () => contents.map(({ entry }) => entry),
    goToContents(id) {
      const link = contents.find(({ entry }) => entry.id === id)?.link;
      return link
        ? new Promise((resolve) => navigator.goLink(link, false, resolve))
        : Promise.resolve(false);
    },
  };
}

function flattenContents(
  links: readonly Link[],
  level = 0,
  prefix = "",
): { readonly entry: ContentsEntry; readonly link: Link }[] {
  return links.flatMap((link, index) => {
    const id = `${prefix}${String(index)}`;
    const title = link.title?.trim();
    return [
      ...(title ? [{ entry: { id, title, level }, link }] : []),
      ...flattenContents(link.children?.items ?? [], level + 1, `${id}.`),
    ];
  });
}
