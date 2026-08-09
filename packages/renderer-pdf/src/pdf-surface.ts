import { createEventEmitter } from "@mdbase-reader/reading-surface";

import type { EmbedPdfRuntime } from "./embedpdf-runtime.js";
import type {
  ReadingSurface,
  ReaderLocator,
  SurfaceDocument,
} from "@mdbase-reader/reading-surface";

export class EmbedPdfSurface implements ReadingSurface {
  public readonly kind = "pdf" as const;
  public readonly document: SurfaceDocument;
  public readonly capabilities: ReadingSurface["capabilities"];

  readonly #runtime: EmbedPdfRuntime;
  readonly #areaSelections =
    createEventEmitter<Parameters<Parameters<EmbedPdfRuntime["onAreaSelected"]>[0]>[0]>();
  readonly #unsubscribeArea: () => void;
  readonly #unsubscribePage: () => void;
  #pageIndex: number;
  #destroyed = false;

  public constructor(document: SurfaceDocument, runtime: EmbedPdfRuntime) {
    this.document = document;
    this.#runtime = runtime;
    this.#pageIndex = runtime.currentPageIndex();
    this.#unsubscribeArea = runtime.onAreaSelected((selection) =>
      this.#areaSelections.emit(selection),
    );
    this.#unsubscribePage = runtime.onPageChanged((pageIndex) => {
      this.#pageIndex = pageIndex;
    });
    this.capabilities = {
      areaSelection: {
        selections: this.#areaSelections,
        beginAreaSelection: () => runtime.beginAreaSelection(),
        cancelAreaSelection: () => runtime.cancelAreaSelection(),
      },
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
      this.#areaSelections.clear();
      this.#runtime.destroy();
      this.#destroyed = true;
    }
    return Promise.resolve();
  }
}
