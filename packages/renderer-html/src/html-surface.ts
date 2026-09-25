import { createEventEmitter } from "@mdbase-reader/reading-surface";

import type { HtmlDocumentRuntime } from "./html-runtime.js";
import type { Annotation, AnnotationId } from "@mdbase-reader/core";
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
  readonly #cleared = createEventEmitter<null>();
  readonly #annotationActivations = createEventEmitter<AnnotationId>();
  readonly #unsubscribeLocation: () => void;
  readonly #unsubscribeSelection: () => void;
  readonly #unsubscribeCleared: () => void;
  readonly #unsubscribeAnnotationActivation: () => void;
  #destroyed = false;

  public constructor(
    public readonly document: SurfaceDocument,
    private readonly runtime: HtmlDocumentRuntime,
  ) {
    this.#unsubscribeLocation = runtime.onLocation((locator) => this.locations.emit(locator));
    this.#unsubscribeSelection = runtime.onSelection((selection) =>
      this.#selections.emit(selection),
    );
    this.#unsubscribeCleared = runtime.onSelectionCleared(() => this.#cleared.emit(null));
    this.#unsubscribeAnnotationActivation = runtime.onAnnotationActivated((annotationId) =>
      this.#annotationActivations.emit(annotationId),
    );
    this.capabilities = {
      textSelection: {
        selections: this.#selections,
        cleared: this.#cleared,
        clearSelection: () => runtime.clearSelection(),
      },
      decorations: {
        setAnnotations: (annotations) => {
          runtime.setAnnotations(this.forThisDocument(annotations));
          return Promise.resolve();
        },
        setActiveAnnotation: (annotation) => {
          runtime.setActiveAnnotation(
            annotation && this.forThisDocument([annotation])[0] ? annotation : null,
          );
          return Promise.resolve();
        },
      },
      annotationNavigation: {
        goToAnnotation: (annotation) => Promise.resolve(runtime.goToAnnotation(annotation)),
      },
      annotationActivation: {
        activations: this.#annotationActivations,
        activationRect: () => runtime.activationRect(),
      },
      textExtraction: {
        extractText: () => Promise.resolve(runtime.extractText()),
      },
      typography: {
        setTypography: (typography) => {
          runtime.setTypography(typography);
          return Promise.resolve();
        },
      },
      // A page with fewer than two headings has no useful contents.
      ...(runtime.contents().length > 1
        ? {
            contents: {
              entries: () => runtime.contents(),
              goTo: (id: string) => Promise.resolve(runtime.goToContents(id)),
            },
          }
        : {}),
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
      this.#unsubscribeCleared();
      this.#unsubscribeAnnotationActivation();
      this.locations.clear();
      this.#selections.clear();
      this.#cleared.clear();
      this.#annotationActivations.clear();
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
