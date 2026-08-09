import { EpubNavigator, type EpubNavigatorListeners } from "@readium/navigator";
import { Locator, Manifest, Publication } from "@readium/shared";

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
  const publication = new Publication({ manifest });
  const locationListeners = new Set<(locator: Readonly<Record<string, unknown>>) => void>();
  const selectionListeners = new Set<(selection: TextSelectionDraft) => void>();
  const initialLocator = input.initialLocator
    ? Locator.deserialize(input.initialLocator)
    : undefined;

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
    undefined,
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
    clearSelection: () => undefined,
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
