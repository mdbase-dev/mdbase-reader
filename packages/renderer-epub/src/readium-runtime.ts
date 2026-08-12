import { EpubNavigator, type EpubNavigatorListeners } from "@readium/navigator";
import {
  HttpFetcher,
  Locator,
  LocatorLocations,
  LocatorText,
  Manifest,
  Publication,
} from "@readium/shared";

import { epubSelectionEvidence } from "./epub-cfi.js";
import { annotationToEpubDecoration } from "./epub-decoration.js";
import {
  sessionReadiumLocatorForPublication,
  stableEpubHref,
  stableReadiumLocator,
} from "./epub-locator.js";
import { safePublicationFetch } from "./epub-safe-fetch.js";
import { extractPublicationText } from "./epub-text.js";

import type { Annotation } from "@mdbase-reader/core";
import type { TextSelectionDraft, Unsubscribe } from "@mdbase-reader/reading-surface";

export interface ReadiumRuntime {
  currentLocator(): Readonly<Record<string, unknown>>;
  goTo(locator: Readonly<Record<string, unknown>>): Promise<boolean>;
  clearSelection(): void;
  extractText(options?: { readonly signal?: AbortSignal }): Promise<string>;
  onLocationChanged(listener: (locator: Readonly<Record<string, unknown>>) => void): Unsubscribe;
  onTextSelected(listener: (selection: TextSelectionDraft) => void): Unsubscribe;
  setAnnotations(annotations: readonly Annotation[]): void;
  setActiveAnnotation(annotation: Annotation | null): void;
  destroy(): Promise<void>;
}

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

export async function createReadiumRuntime(input: {
  readonly container: HTMLElement;
  readonly manifest: unknown;
  readonly publicationBaseUrl: string;
  readonly initialLocator?: Readonly<Record<string, unknown>>;
}): Promise<ReadiumRuntime> {
  const manifest = Manifest.deserialize(input.manifest);
  if (!manifest) {
    throw new Error("Readium could not parse the publication manifest.");
  }
  const publication = new Publication({ manifest, fetcher: new HttpFetcher(safePublicationFetch) });
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
  );
  await navigator.load();

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
    clearSelection() {
      input.container
        .querySelectorAll<HTMLIFrameElement>(".readium-navigator-iframe")
        .forEach((frame) => frame.contentWindow?.getSelection()?.removeAllRanges());
    },
    extractText: (options) => extractPublicationText(publication, options?.signal),
    onLocationChanged(listener) {
      locationListeners.add(listener);
      return () => locationListeners.delete(listener);
    },
    onTextSelected(listener) {
      selectionListeners.add(listener);
      return () => selectionListeners.delete(listener);
    },
    setAnnotations(annotations) {
      navigator.applyDecorations(
        annotations.flatMap((annotation) => {
          const decoration = annotationToEpubDecoration(
            annotation,
            publication,
            input.publicationBaseUrl,
          );
          return decoration ? [decoration] : [];
        }),
        "mdbase-reader-annotations",
      );
    },
    setActiveAnnotation(annotation) {
      const decoration = annotation
        ? annotationToEpubDecoration(annotation, publication, input.publicationBaseUrl, true)
        : null;
      navigator.applyDecorations(decoration ? [decoration] : [], "mdbase-reader-active-annotation");
    },
    async destroy() {
      locationListeners.clear();
      selectionListeners.clear();
      await navigator.destroy();
    },
  };
}

type ReadiumTextSelection = Parameters<EpubNavigatorListeners["textSelected"]>[0];

function selectedTextDraft(input: {
  readonly selection: ReadiumTextSelection;
  readonly publication: Publication;
  readonly container: HTMLElement;
  readonly publicationBaseUrl: string;
}): TextSelectionDraft {
  const { selection } = input;
  const readingOrderIndex = selection.locator
    ? input.publication.readingOrder.findIndexWithHref(selection.locator.href)
    : -1;
  const evidence = selectionEvidenceFromFrame(
    input.container,
    selection.targetFrameSrc,
    readingOrderIndex,
  );
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
  return readiumSelectionToDraft({
    ...selection,
    ...(locator ? { locator } : {}),
    publicationBaseUrl: input.publicationBaseUrl,
    ...(evidence ?? {}),
  });
}

function selectionEvidenceFromFrame(
  container: HTMLElement,
  targetFrameSrc: string,
  readingOrderIndex: number,
): ReturnType<typeof epubSelectionEvidence> {
  const frame = [
    ...container.querySelectorAll<HTMLIFrameElement>(".readium-navigator-iframe"),
  ].find((candidate) => candidate.contentWindow?.location.href === targetFrameSrc);
  const selection = frame?.contentWindow?.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  return epubSelectionEvidence(selection.getRangeAt(0), readingOrderIndex);
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
