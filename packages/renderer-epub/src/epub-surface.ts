import { createEventEmitter } from "@mdbase-reader/reading-surface";

import type { ReadiumRuntime } from "./readium-runtime.js";
import type {
  ReadingSurface,
  ReaderLocator,
  SurfaceDocument,
} from "@mdbase-reader/reading-surface";

export class ReadiumEpubSurface implements ReadingSurface {
  public readonly kind = "epub" as const;
  public readonly document: SurfaceDocument;
  public readonly capabilities: ReadingSurface["capabilities"];
  public readonly locations = createEventEmitter<ReaderLocator>();

  readonly #runtime: ReadiumRuntime;
  readonly #selections =
    createEventEmitter<Parameters<Parameters<ReadiumRuntime["onTextSelected"]>[0]>[0]>();
  readonly #unsubscribeLocation: () => void;
  readonly #unsubscribeSelection: () => void;
  #locator: Readonly<Record<string, unknown>>;
  #destroyed = false;

  public constructor(document: SurfaceDocument, runtime: ReadiumRuntime) {
    this.document = document;
    this.#runtime = runtime;
    this.#locator = runtime.currentLocator();
    this.#unsubscribeLocation = runtime.onLocationChanged((locator) => {
      this.#locator = locator;
      this.locations.emit({ kind: "epub", locator });
    });
    this.#unsubscribeSelection = runtime.onTextSelected((selection) =>
      this.#selections.emit(selection),
    );
    this.capabilities = {
      textSelection: {
        selections: this.#selections,
        clearSelection: () => runtime.clearSelection(),
      },
      decorations: {
        setAnnotations: (annotations) => {
          runtime.setAnnotations(
            annotations.filter(
              ({ document }) =>
                document?.fileId === this.document.document.fileId &&
                document.revision === this.document.document.revision,
            ),
          );
          return Promise.resolve();
        },
      },
    };
  }

  public currentLocation(): ReaderLocator {
    return { kind: "epub", locator: this.#locator };
  }

  public async goTo(locator: ReaderLocator): Promise<boolean> {
    if (locator.kind !== "epub") {
      return false;
    }
    const moved = await this.#runtime.goTo(locator.locator);
    if (moved) {
      this.#locator = locator.locator;
    }
    return moved;
  }

  public async destroy(): Promise<void> {
    if (!this.#destroyed) {
      this.#unsubscribeLocation();
      this.#unsubscribeSelection();
      this.#selections.clear();
      this.locations.clear();
      await this.#runtime.destroy();
      this.#destroyed = true;
    }
  }
}

export async function mountReadiumEpubSurface(input: {
  readonly document: SurfaceDocument;
  readonly runtime: Promise<ReadiumRuntime>;
}): Promise<ReadiumEpubSurface> {
  return new ReadiumEpubSurface(input.document, await input.runtime);
}
