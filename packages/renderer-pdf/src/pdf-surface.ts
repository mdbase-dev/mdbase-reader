import { createEventEmitter, scrollMotionTracker } from "@mdbase-reader/reading-surface";

import type { EmbedPdfRuntime } from "./embedpdf-runtime.js";
import type { AnnotationId } from "@mdbase-reader/core";
import type {
  ReadingMotion,
  ReadingSurface,
  ReaderLocator,
  SurfaceDocument,
} from "@mdbase-reader/reading-surface";

export class EmbedPdfSurface implements ReadingSurface {
  public readonly kind = "pdf" as const;
  public readonly document: SurfaceDocument;
  public readonly capabilities: ReadingSurface["capabilities"];
  public readonly locations = createEventEmitter<ReaderLocator>();

  readonly #runtime: EmbedPdfRuntime;
  readonly #areaSelections =
    createEventEmitter<Parameters<Parameters<EmbedPdfRuntime["onAreaSelected"]>[0]>[0]>();
  readonly #textSelections =
    createEventEmitter<Parameters<Parameters<EmbedPdfRuntime["onTextSelected"]>[0]>[0]>();
  readonly #annotationActivations = createEventEmitter<AnnotationId>();
  readonly #cleared = createEventEmitter<null>();
  readonly #motions = createEventEmitter<ReadingMotion>();
  readonly #unsubscribeMotion: () => void;
  readonly #unsubscribeCleared: () => void;
  readonly #unsubscribeArea: () => void;
  readonly #unsubscribePage: () => void;
  readonly #unsubscribeText: () => void;
  readonly #unsubscribeAnnotationActivation: () => void;
  #pageIndex: number;
  #destroyed = false;

  public constructor(document: SurfaceDocument, runtime: EmbedPdfRuntime) {
    this.document = document;
    this.#runtime = runtime;
    this.#pageIndex = runtime.currentPageIndex();
    this.#unsubscribeArea = runtime.onAreaSelected((selection) => {
      // EmbedPDF's marquee is a modal, viewport-sized capture layer. Area
      // selection is a one-shot Reader interaction, so release that layer as
      // soon as a capture completes and before the composer becomes active.
      runtime.cancelAreaSelection();
      this.#areaSelections.emit(selection);
    });
    this.#unsubscribeText = runtime.onTextSelected((selection) =>
      this.#textSelections.emit(selection),
    );
    this.#unsubscribeCleared =
      runtime.onSelectionCleared?.(() => this.#cleared.emit(null)) ?? (() => undefined);
    this.#unsubscribeAnnotationActivation = runtime.onAnnotationActivated((annotationId) =>
      this.#annotationActivations.emit(annotationId),
    );
    const motion = scrollMotionTracker((value) => this.#motions.emit(value));
    const stops = [runtime.onScrolled?.(motion.track), runtime.onViewportResized?.(motion.resized)];
    this.#unsubscribeMotion = () => stops.forEach((stop) => stop?.());
    this.#unsubscribePage = runtime.onPageChanged((pageIndex) => {
      this.#pageIndex = pageIndex;
      this.locations.emit({ kind: "pdf", pageIndex });
    });
    this.capabilities = {
      textSelection: {
        selections: this.#textSelections,
        cleared: this.#cleared,
        clearSelection: () => runtime.clearTextSelection(),
      },
      ...(runtime.onScrolled ? { motion: { motions: this.#motions } } : {}),
      areaSelection: {
        selections: this.#areaSelections,
        beginAreaSelection: () => runtime.beginAreaSelection(),
        cancelAreaSelection: () => runtime.cancelAreaSelection(),
      },
      textExtraction: {
        extractText: (options) => runtime.extractText(options),
      },
      decorations: {
        setAnnotations: (annotations) => {
          runtime.setAnnotations(
            annotations.filter(
              ({ document }) => document?.fileId === this.document.document.fileId,
            ),
          );
          return Promise.resolve();
        },
        setActiveAnnotation: (annotation) => {
          runtime.setActiveAnnotation(
            annotation && this.forThisDocument(annotation) ? annotation : null,
          );
          return Promise.resolve();
        },
      },
      annotationActivation: { activations: this.#annotationActivations },
    };
  }

  public currentLocation(): ReaderLocator {
    return { kind: "pdf", pageIndex: this.#pageIndex };
  }

  public goTo(locator: ReaderLocator): Promise<boolean> {
    if (locator.kind !== "pdf" || locator.pageIndex < 0 || !Number.isInteger(locator.pageIndex)) {
      return Promise.resolve(false);
    }
    this.#runtime.goToPage(locator.pageIndex);
    this.#pageIndex = locator.pageIndex;
    return Promise.resolve(true);
  }

  public destroy(): Promise<void> {
    if (!this.#destroyed) {
      this.#unsubscribeArea();
      this.#unsubscribePage();
      this.#unsubscribeText();
      this.#unsubscribeCleared();
      this.#unsubscribeMotion();
      this.#unsubscribeAnnotationActivation();
      this.#areaSelections.clear();
      this.#textSelections.clear();
      this.#cleared.clear();
      this.#motions.clear();
      this.#annotationActivations.clear();
      this.locations.clear();
      this.#runtime.destroy();
      this.#destroyed = true;
    }
    return Promise.resolve();
  }

  private forThisDocument(annotation: {
    readonly document?: SurfaceDocument["document"];
  }): boolean {
    return annotation.document?.fileId === this.document.document.fileId;
  }
}
