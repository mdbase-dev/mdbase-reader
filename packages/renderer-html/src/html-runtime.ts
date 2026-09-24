import { MarginMarkers, forwardApplicationShortcut } from "@mdbase-reader/reading-surface";

import { htmlLocator, htmlSelectionDraft, locateHtmlTarget } from "./html-range.js";
import { scrollHtmlElement } from "./html-scroll.js";
import { applyHtmlTypography } from "./html-typography.js";

import type { Annotation, AnnotationId } from "@mdbase-reader/core";
import type {
  ContentsEntry,
  ReaderLocator,
  ReadingTypography,
  TextSelectionDraft,
  ViewportRect,
} from "@mdbase-reader/reading-surface";

type Unsubscribe = () => void;

export class HtmlDocumentRuntime {
  readonly #frame: HTMLIFrameElement;
  readonly #document: Document;
  readonly #view: Window;
  readonly #href: string;
  readonly #locationListeners = new Set<(locator: ReaderLocator) => void>();
  readonly #selectionListeners = new Set<(selection: TextSelectionDraft) => void>();
  readonly #activationListeners = new Set<(annotationId: AnnotationId) => void>();
  readonly #onSelection = (): void => this.captureSelection();
  readonly #onPointerUp = (event: PointerEvent): void => {
    this.captureSelection();
    this.captureAnnotationActivation(event);
  };
  readonly #onScroll = (): void => this.emitLocation();
  readonly #onKeyDown = (event: KeyboardEvent): void =>
    forwardApplicationShortcut(event, this.#frame.ownerDocument);
  readonly #markers: MarginMarkers;
  // Images and fonts reflow the page after load; markers follow the text.
  readonly #reflow =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.#markers.layout());
  #destroyed = false;
  #annotationRanges: readonly { readonly annotation: Annotation; readonly range: Range }[] = [];

  public constructor(frame: HTMLIFrameElement, href: string) {
    const document = frame.contentDocument;
    const view = frame.contentWindow;
    if (!document || !view) {
      throw new Error("The isolated HTML document is unavailable.");
    }
    this.#frame = frame;
    this.#document = document;
    this.#view = view;
    this.#href = href;
    document.addEventListener("pointerup", this.#onPointerUp);
    document.addEventListener("keyup", this.#onSelection);
    document.addEventListener("keydown", this.#onKeyDown);
    view.addEventListener("scroll", this.#onScroll, { passive: true });
    this.#markers = new MarginMarkers(document, (annotationId) => {
      for (const listener of this.#activationListeners) {
        listener(annotationId);
      }
    });
    this.#reflow?.observe(document.body);
  }

  public onLocation(listener: (locator: ReaderLocator) => void): Unsubscribe {
    this.#locationListeners.add(listener);
    return () => this.#locationListeners.delete(listener);
  }

  public onSelection(listener: (selection: TextSelectionDraft) => void): Unsubscribe {
    this.#selectionListeners.add(listener);
    return () => this.#selectionListeners.delete(listener);
  }

  public onAnnotationActivated(listener: (annotationId: AnnotationId) => void): Unsubscribe {
    this.#activationListeners.add(listener);
    return () => this.#activationListeners.delete(listener);
  }

  /** Section headings, so long saved pages can be navigated like a book. */
  public contents(): readonly ContentsEntry[] {
    return headingElements(this.#document).map((heading, index) => ({
      id: String(index),
      title: heading.textContent.replace(/\s+/gu, " ").trim(),
      level: Number(heading.tagName.charAt(1)) - 1,
    }));
  }

  public goToContents(id: string): boolean {
    const heading = headingElements(this.#document)[Number(id)];
    if (!heading) {
      return false;
    }
    scrollHtmlElement(this.#view, heading, "start");
    return true;
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
    scrollHtmlElement(this.#view, element, "center");
    return true;
  }

  public setAnnotations(annotations: readonly Annotation[]): void {
    this.#annotationRanges = annotations.flatMap((annotation) => {
      const range = annotation.target ? locateHtmlTarget(this.#document, annotation.target) : null;
      return range ? [{ annotation, range }] : [];
    });
    setCssHighlights(
      this.#view,
      this.#annotationRanges.map(({ range }) => range),
    );
    this.#markers.set(
      this.#annotationRanges.map(({ annotation, range }) => ({
        id: annotation.id,
        range,
        hasNote: hasWrittenNote(annotation.body),
      })),
    );
  }

  public setActiveAnnotation(annotation: Annotation | null): void {
    const range = annotation?.target ? locateHtmlTarget(this.#document, annotation.target) : null;
    setCssHighlight(this.#view, "reader-active-annotation", range ? [range] : []);
    this.#markers.setActive(range && annotation ? annotation.id : null);
  }

  public setTypography(typography: ReadingTypography): void {
    applyHtmlTypography(this.#document, typography);
    this.#markers.layout();
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
    this.#document.removeEventListener("pointerup", this.#onPointerUp);
    this.#document.removeEventListener("keyup", this.#onSelection);
    this.#document.removeEventListener("keydown", this.#onKeyDown);
    this.#view.removeEventListener("scroll", this.#onScroll);
    this.#reflow?.disconnect();
    this.#markers.destroy();
    clearCssHighlights(this.#view);
    this.#locationListeners.clear();
    this.#selectionListeners.clear();
    this.#activationListeners.clear();
    this.#annotationRanges = [];
    this.#destroyed = true;
  }

  private captureSelection(): void {
    const selection = this.#view.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }
    const range = selection.getRangeAt(0);
    const draft = htmlSelectionDraft({
      document: this.#document,
      range,
      href: this.#href,
      progression: scrollProgression(this.#document),
    });
    if (draft) {
      const anchored = { ...draft, anchor: frameViewportRect(this.#frame, range) };
      for (const listener of this.#selectionListeners) {
        listener(anchored);
      }
    }
  }

  private captureAnnotationActivation(event: PointerEvent): void {
    const selection = this.#view.getSelection();
    if (selection && !selection.isCollapsed) {
      return;
    }
    const position = caretPositionAtPoint(this.#document, event.clientX, event.clientY);
    if (!position) {
      return;
    }
    const matched = this.#annotationRanges.find(({ range }) =>
      range.isPointInRange(position.node, position.offset),
    );
    if (matched) {
      for (const listener of this.#activationListeners) {
        listener(matched.annotation.id);
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

/** Whether an annotation carries the reader's own words, beyond the quoted passage. */
function hasWrittenNote(body: string): boolean {
  return body.split("\n").some((line) => line.trim() !== "" && !line.trimStart().startsWith(">"));
}

function caretPositionAtPoint(
  document: Document,
  x: number,
  y: number,
): { readonly node: Node; readonly offset: number } | null {
  const position = document.caretPositionFromPoint(x, y);
  return position ? { node: position.offsetNode, offset: position.offset } : null;
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

function headingElements(document: Document): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>("h1, h2, h3")].filter(
    (heading) => heading.textContent.trim() !== "",
  );
}

/** Converts a range inside the frame to the parent window's viewport. */
export function frameViewportRect(frame: HTMLIFrameElement, range: Range): ViewportRect {
  const inner = range.getBoundingClientRect();
  const outer = frame.getBoundingClientRect();
  return {
    x: outer.left + frame.clientLeft + inner.left,
    y: outer.top + frame.clientTop + inner.top,
    width: inner.width,
    height: inner.height,
  };
}
