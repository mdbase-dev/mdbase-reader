import { readingMeasureCharacters } from "@mdbase-reader/reading-surface";
import { EpubNavigator, EpubPreferences, type EpubNavigatorListeners } from "@readium/navigator";
import { HttpFetcher, Locator, LocatorLocations, Manifest, Publication } from "@readium/shared";

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
  const selectionListeners = new Set<(selection: TextSelectionDraft) => void>();
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
    textSelected: (selection) => {
      const draft = selectedTextDraft({
        selection,
        publication,
        container: input.container,
        publicationBaseUrl: input.publicationBaseUrl,
      });
      for (const listener of selectionListeners) {
        listener(draft);
      }
    },
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
  const frames = new EpubFrameEnhancements(input.container);

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
      annotationActivations.destroy();
      frames.destroy();
      await navigator.destroy();
    },
  };
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
