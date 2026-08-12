import { htmlLocator, htmlSelectionDraft, locateHtmlTarget } from "./html-range.js";

import type { Annotation } from "@mdbase-reader/core";
import type { ReaderLocator, TextSelectionDraft } from "@mdbase-reader/reading-surface";

type Unsubscribe = () => void;

export class HtmlDocumentRuntime {
  readonly #document: Document;
  readonly #view: Window;
  readonly #href: string;
  readonly #locationListeners = new Set<(locator: ReaderLocator) => void>();
  readonly #selectionListeners = new Set<(selection: TextSelectionDraft) => void>();
  readonly #onSelection = (): void => this.captureSelection();
  readonly #onScroll = (): void => this.emitLocation();
  #destroyed = false;

  public constructor(frame: HTMLIFrameElement, href: string) {
    const document = frame.contentDocument;
    const view = frame.contentWindow;
    if (!document || !view) {
      throw new Error("The isolated HTML document is unavailable.");
    }
    this.#document = document;
    this.#view = view;
    this.#href = href;
    document.addEventListener("pointerup", this.#onSelection);
    document.addEventListener("keyup", this.#onSelection);
    view.addEventListener("scroll", this.#onScroll, { passive: true });
  }

  public onLocation(listener: (locator: ReaderLocator) => void): Unsubscribe {
    this.#locationListeners.add(listener);
    return () => this.#locationListeners.delete(listener);
  }

  public onSelection(listener: (selection: TextSelectionDraft) => void): Unsubscribe {
    this.#selectionListeners.add(listener);
    return () => this.#selectionListeners.delete(listener);
  }

  public currentLocation(): ReaderLocator {
    return htmlLocator(this.#href, scrollProgression(this.#document));
  }

  public goTo(locator: ReaderLocator): boolean {
    if (locator.kind !== "html" || locator.href !== this.#href) {
      return false;
    }
    const progression = locator.progression ?? 0;
    const root = this.#document.scrollingElement ?? this.#document.documentElement;
    this.#view.scrollTo({ top: progression * Math.max(0, root.scrollHeight - root.clientHeight) });
    return true;
  }

  public goToAnnotation(annotation: Annotation): boolean {
    const range = annotation.target ? locateHtmlTarget(this.#document, annotation.target) : null;
    const element = range ? parentElement(range.startContainer) : null;
    if (!range || !element) {
      return false;
    }
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }

  public setAnnotations(annotations: readonly Annotation[]): void {
    const ranges = annotations.flatMap((annotation) => {
      const range = annotation.target ? locateHtmlTarget(this.#document, annotation.target) : null;
      return range ? [range] : [];
    });
    setCssHighlights(this.#view, ranges);
  }

  public setActiveAnnotation(annotation: Annotation | null): void {
    const range = annotation?.target ? locateHtmlTarget(this.#document, annotation.target) : null;
    setCssHighlight(this.#view, "reader-active-annotation", range ? [range] : []);
  }

  public clearSelection(): void {
    this.#view.getSelection()?.removeAllRanges();
  }

  public extractText(): string {
    return this.#document.body.textContent;
  }

  public destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#document.removeEventListener("pointerup", this.#onSelection);
    this.#document.removeEventListener("keyup", this.#onSelection);
    this.#view.removeEventListener("scroll", this.#onScroll);
    clearCssHighlights(this.#view);
    this.#locationListeners.clear();
    this.#selectionListeners.clear();
    this.#destroyed = true;
  }

  private captureSelection(): void {
    const selection = this.#view.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }
    const draft = htmlSelectionDraft({
      document: this.#document,
      range: selection.getRangeAt(0),
      href: this.#href,
      progression: scrollProgression(this.#document),
    });
    if (draft) {
      for (const listener of this.#selectionListeners) {
        listener(draft);
      }
    }
  }

  private emitLocation(): void {
    const locator = this.currentLocation();
    for (const listener of this.#locationListeners) {
      listener(locator);
    }
  }
}

function scrollProgression(document: Document): number {
  const root = document.scrollingElement ?? document.documentElement;
  const extent = root.scrollHeight - root.clientHeight;
  return extent > 0 ? Math.max(0, Math.min(1, root.scrollTop / extent)) : 0;
}

function parentElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

interface HighlightRegistry {
  set(name: string, value: unknown): void;
  delete(name: string): void;
}

type HighlightWindow = Window & {
  readonly Highlight?: new (...ranges: Range[]) => unknown;
  readonly CSS?: { readonly highlights?: HighlightRegistry };
};

function setCssHighlights(view: Window, ranges: readonly Range[]): void {
  setCssHighlight(view, "reader-annotations", ranges);
}

function setCssHighlight(view: Window, name: string, ranges: readonly Range[]): void {
  const target = view as HighlightWindow;
  const registry = target.CSS?.highlights;
  const Highlight = target.Highlight;
  if (!registry || !Highlight) {
    return;
  }
  registry.delete(name);
  if (ranges.length > 0) {
    registry.set(name, new Highlight(...ranges));
  }
}

function clearCssHighlights(view: Window): void {
  const highlights = (view as HighlightWindow).CSS?.highlights;
  highlights?.delete("reader-annotations");
  highlights?.delete("reader-active-annotation");
}
