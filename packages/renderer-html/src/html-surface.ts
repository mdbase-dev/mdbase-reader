import { createEventEmitter } from "@mdbase-reader/reading-surface";

import type { HtmlDocumentRuntime } from "./html-runtime.js";
import type { Annotation } from "@mdbase-reader/core";
import type {
  ReaderLocator,
  ReadingSurface,
  SurfaceDocument,
  TextSelectionDraft,
} from "@mdbase-reader/reading-surface";

export class HtmlReadingSurface implements ReadingSurface {
  public readonly kind = "html" as const;
  public readonly locations = createEventEmitter<ReaderLocator>();
  public readonly capabilities: ReadingSurface["capabilities"];
  readonly #selections = createEventEmitter<TextSelectionDraft>();
  readonly #unsubscribeLocation: () => void;
  readonly #unsubscribeSelection: () => void;
  #destroyed = false;

  public constructor(
    public readonly document: SurfaceDocument,
    private readonly runtime: HtmlDocumentRuntime,
  ) {
    this.#unsubscribeLocation = runtime.onLocation((locator) => this.locations.emit(locator));
    this.#unsubscribeSelection = runtime.onSelection((selection) =>
      this.#selections.emit(selection),
    );
    this.capabilities = {
      textSelection: {
        selections: this.#selections,
        clearSelection: () => runtime.clearSelection(),
      },
      decorations: {
        setAnnotations: (annotations) => {
          runtime.setAnnotations(this.forThisDocument(annotations));
          return Promise.resolve();
        },
      },
      annotationNavigation: {
        goToAnnotation: (annotation) => Promise.resolve(runtime.goToAnnotation(annotation)),
      },
    };
  }

  public currentLocation(): ReaderLocator {
    return this.runtime.currentLocation();
  }

  public goTo(locator: ReaderLocator): Promise<boolean> {
    return Promise.resolve(this.runtime.goTo(locator));
  }

  public destroy(): Promise<void> {
    if (!this.#destroyed) {
      this.#unsubscribeLocation();
      this.#unsubscribeSelection();
      this.locations.clear();
      this.#selections.clear();
      this.runtime.destroy();
      this.#destroyed = true;
    }
    return Promise.resolve();
  }

  private forThisDocument(annotations: readonly Annotation[]): readonly Annotation[] {
    return annotations.filter(
      ({ document }) =>
        document?.fileId === this.document.document.fileId &&
        document.revision === this.document.document.revision,
    );
  }
}
