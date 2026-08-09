import { EpubNavigator, type EpubNavigatorListeners } from "@readium/navigator";
import { HttpFetcher, Locator, LocatorLocations, Manifest, Publication } from "@readium/shared";

import { safePublicationFetch } from "./epub-safe-fetch.js";

import type { TextSelectionDraft, Unsubscribe } from "@mdbase-reader/reading-surface";

export interface ReadiumRuntime {
  currentLocator(): Readonly<Record<string, unknown>>;
  goTo(locator: Readonly<Record<string, unknown>>): Promise<boolean>;
  clearSelection(): void;
  onLocationChanged(listener: (locator: Readonly<Record<string, unknown>>) => void): Unsubscribe;
  onTextSelected(listener: (selection: TextSelectionDraft) => void): Unsubscribe;
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
}): TextSelectionDraft {
  const serialized = input.locator
    ? serializeReadiumLocator(input.locator)
    : { href: input.targetFrameSrc, type: "application/xhtml+xml" };
  return {
    target: {
      quote: {
        exact: input.text,
        ...(input.locator?.text?.before ? { prefix: input.locator.text.before } : {}),
        ...(input.locator?.text?.after ? { suffix: input.locator.text.after } : {}),
      },
      ...(input.locator?.locations.fragments[0]
        ? { epub: { cfi: input.locator.locations.fragments[0] } }
        : {}),
    },
    locator: { kind: "epub", locator: serialized },
  };
}

export async function createReadiumRuntime(input: {
  readonly container: HTMLElement;
  readonly manifest: unknown;
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
  const requestedLocator = input.initialLocator ? Locator.deserialize(input.initialLocator) : null;
  const initialLocator =
    requestedLocator && publication.readingOrder.findWithHref(requestedLocator.href)
      ? requestedLocator
      : positions[0];

  const listeners: EpubNavigatorListeners = {
    frameLoaded: () => undefined,
    positionChanged: (locator) => {
      const serialized = serializeReadiumLocator(locator);
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
      const draft = readiumSelectionToDraft(selection);
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
    currentLocator: () => serializeReadiumLocator(navigator.currentLocator),
    goTo(locator) {
      const destination = Locator.deserialize(locator);
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
    onLocationChanged(listener) {
      locationListeners.add(listener);
      return () => locationListeners.delete(listener);
    },
    onTextSelected(listener) {
      selectionListeners.add(listener);
      return () => selectionListeners.delete(listener);
    },
    async destroy() {
      locationListeners.clear();
      selectionListeners.clear();
      await navigator.destroy();
    },
  };
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
