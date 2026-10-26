import { t } from "@lingui/core/macro";
import {
  MarginMarkers,
  forwardApplicationShortcut,
  locateSearchQuote,
  scrollMotionTracker,
  selectionRangeKey,
  watchSettledSelection,
} from "@mdbase-reader/reading-surface";

import {
  activeAnnotationHighlight,
  clearCssHighlights,
  setAnnotationHighlights,
  setCssHighlight,
} from "./html-css-highlights.js";
import { htmlDocumentText } from "./html-document.js";
import { followEmbedderPalette } from "./html-palette.js";
import { HtmlTargetLocator, htmlLocator, htmlSelectionDraft } from "./html-range.js";
import {
  containsHtmlAnnotationRange,
  htmlLocationTarget,
  resolveHtmlReadingRange,
} from "./html-reading-range.js";
import { scrollHtmlElement } from "./html-scroll.js";
import { applyHtmlTypography } from "./html-typography.js";

import type {
  Annotation,
  AnnotationId,
  AnnotationTarget,
  DocumentRange,
  QuoteSelector,
} from "@mdbase-reader/core";
import type {
  ContentsEntry,
  ReaderLocator,
  ReadingMotion,
  ReadingRangeResolution,
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
  readonly #clearedListeners = new Set<() => void>();
  readonly #motionListeners = new Set<(motion: ReadingMotion) => void>();
  readonly #motion = scrollMotionTracker((motion) =>
    this.#motionListeners.forEach((listener) => listener(motion)),
  );
  #hasSelection = false;
  /** The range last reported, so a touch selection that settles after a release is not new. */
  #reportedRange: string | null = null;
  #activationRect: ViewportRect | null = null;
  readonly #onSelection = (): void => this.captureSelection("keyboard");
  readonly #onPointerUp = (event: PointerEvent): void => {
    this.captureSelection("pointer");
    this.captureAnnotationActivation(event);
  };
  readonly #onScroll = (): void => {
    this.emitLocation();
    this.#motion.track(scrollingRoot(this.#document).scrollTop);
  };
  readonly #onResize = (): void => this.#motion.settle("resize");
  readonly #onKeyDown = (event: KeyboardEvent): void =>
    forwardApplicationShortcut(event, this.#frame.ownerDocument);
  readonly #markers: MarginMarkers;
  readonly #targets: HtmlTargetLocator;
  // Images and fonts reflow the page after load; markers follow the text.
  readonly #reflow =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.#markers.layout());
  readonly #stopSettledSelection: Unsubscribe;
  readonly #stopPalette: Unsubscribe;
  #destroyed = false;
  #annotationRanges: readonly { readonly annotation: Annotation; readonly range: Range }[] = [];

  public constructor(frame: HTMLIFrameElement, href: string) {
    const document = frame.contentDocument;
    const view = frame.contentWindow;
    if (!document || !view) {
      throw new Error(t({ message: "The isolated HTML document is unavailable." }));
    }
    this.#frame = frame;
    this.#document = document;
    this.#view = view;
    this.#href = href;
    this.#targets = new HtmlTargetLocator(document);
    document.addEventListener("pointerup", this.#onPointerUp);
    document.addEventListener("keyup", this.#onSelection);
    document.addEventListener("keydown", this.#onKeyDown);
    view.addEventListener("scroll", this.#onScroll, { passive: true });
    view.addEventListener("resize", this.#onResize);
    this.#stopSettledSelection = watchSettledSelection(document, () =>
      this.captureSelection("touch"),
    );
    this.#stopPalette = followEmbedderPalette(frame);
    this.#markers = new MarginMarkers(document, (annotationId) => {
      this.#activationRect = null;
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

  public onMotion(listener: (motion: ReadingMotion) => void): Unsubscribe {
    this.#motionListeners.add(listener);
    return () => this.#motionListeners.delete(listener);
  }

  public onSelection(listener: (selection: TextSelectionDraft) => void): Unsubscribe {
    this.#selectionListeners.add(listener);
    return () => this.#selectionListeners.delete(listener);
  }

  /** Where the highlight activated by the latest click sits, in the host viewport. */
  public activationRect(): ViewportRect | null {
    return this.#activationRect;
  }

  /** Called when a selection collapses, or a click in the page leaves nothing selected. */
  public onSelectionCleared(listener: () => void): Unsubscribe {
    this.#clearedListeners.add(listener);
    return () => this.#clearedListeners.delete(listener);
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
    this.#motion.settle("jump");
    scrollHtmlElement(this.#view, heading, "start");
    return true;
  }

  public currentLocation(): ReaderLocator {
    return htmlLocator(this.#href, scrollProgression(this.#document));
  }

  public containsAnnotationRange(range: DocumentRange, target: AnnotationTarget): boolean | null {
    return this.#destroyed
      ? null
      : containsHtmlAnnotationRange(this.#document, this.#href, range, target);
  }

  public resolveReadingRange(range: DocumentRange): ReadingRangeResolution {
    return resolveHtmlReadingRange(this.#document, this.#href, range);
  }

  public goTo(locator: ReaderLocator): boolean {
    const target = htmlLocationTarget(this.#document, this.#href, locator);
    if (!target) {
      return false;
    }
    this.#motion.settle("jump");
    if (target.kind === "fragment") {
      scrollHtmlElement(this.#view, target.element, "start");
      return true;
    }
    const root = this.#document.scrollingElement ?? this.#document.documentElement;
    this.#view.scrollTo({
      top: target.progression * Math.max(0, root.scrollHeight - root.clientHeight),
    });
    return true;
  }

  public goToAnnotation(annotation: Annotation): boolean {
    const range = annotation.target ? this.#targets.locate(annotation.target) : null;
    const element = range ? parentElement(range.startContainer) : null;
    if (!range || !element) {
      return false;
    }
    this.#motion.settle("jump");
    scrollHtmlElement(this.#view, element, "center");
    return true;
  }

  public setAnnotations(annotations: readonly Annotation[]): void {
    this.#annotationRanges = annotations.flatMap((annotation) => {
      const range = annotation.target ? this.#targets.locate(annotation.target) : null;
      return range ? [{ annotation, range }] : [];
    });
    setAnnotationHighlights(
      this.#view,
      this.#annotationRanges.map(({ annotation, range }) => ({ color: annotation.color, range })),
    );
    this.#markers.set(
      this.#annotationRanges.map(({ annotation, range }) => ({
        id: annotation.id,
        range,
        hasNote: hasWrittenNote(annotation.body),
        color: annotation.color,
      })),
    );
  }

  public nearestAnnotation(): AnnotationId | null {
    return this.#markers.nearest();
  }

  public setActiveAnnotation(annotation: Annotation | null): void {
    const range = annotation?.target ? this.#targets.locate(annotation.target) : null;
    setCssHighlight(this.#view, activeAnnotationHighlight, range ? [range] : []);
    this.#markers.setActive(range && annotation ? annotation.id : null);
  }

  public setTypography(typography: ReadingTypography): void {
    applyHtmlTypography(this.#document, typography);
    this.#markers.layout();
  }

  public clearSelection(): void {
    this.#view.getSelection()?.removeAllRanges();
    this.#hasSelection = false;
    this.#reportedRange = null;
  }

  public clearSearch(): void {
    setCssHighlight(this.#view, "reader-search-passage", []);
  }

  public goToSearchQuote(quote: QuoteSelector): boolean {
    this.clearSearch();
    const range = locateSearchQuote(this.#document.body, quote);
    if (!range) {
      return false;
    }
    setCssHighlight(this.#view, "reader-search-passage", [range]);
    const element = parentElement(range.startContainer);
    if (!element) {
      return false;
    }
    this.#motion.settle("jump");
    const bounds = range.getBoundingClientRect();
    this.#view.scrollTo({
      top: Math.max(0, this.#view.scrollY + bounds.top - this.#view.innerHeight / 2),
      behavior: "instant",
    });
    this.#frame.focus();
    return true;
  }

  public extractText(): string {
    return htmlDocumentText(this.#document);
  }

  public destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#document.removeEventListener("pointerup", this.#onPointerUp);
    this.#document.removeEventListener("keyup", this.#onSelection);
    this.#document.removeEventListener("keydown", this.#onKeyDown);
    this.#view.removeEventListener("scroll", this.#onScroll);
    this.#view.removeEventListener("resize", this.#onResize);
    this.#stopSettledSelection();
    this.#stopPalette();
    this.#reflow?.disconnect();
    this.#markers.destroy();
    this.#targets.destroy();
    this.clearSearch();
    clearCssHighlights(this.#view);
    this.#locationListeners.clear();
    this.#selectionListeners.clear();
    this.#clearedListeners.clear();
    this.#motionListeners.clear();
    this.#activationListeners.clear();
    this.#annotationRanges = [];
    this.#destroyed = true;
  }

  private captureSelection(via: "pointer" | "keyboard" | "touch"): void {
    const selection = this.#view.getSelection();
    const key = selectionRangeKey(selection);
    if (!selection || key === null) {
      this.#reportedRange = null;
      // A click that leaves nothing selected also dismisses selection UI, even with none showing.
      if (this.#hasSelection || via === "pointer") {
        this.#hasSelection = false;
        this.#clearedListeners.forEach((listener) => listener());
      }
      return;
    }
    // Selections also settle after a release has reported them; only a changed range is new.
    if (via === "touch" && key === this.#reportedRange) {
      return;
    }
    this.#reportedRange = key;
    this.#hasSelection = true;
    const range = selection.getRangeAt(0);
    const draft = htmlSelectionDraft({
      document: this.#document,
      range,
      href: this.#href,
      progression: scrollProgression(this.#document),
    });
    if (draft) {
      const anchored = { ...draft, anchor: frameViewportRect(this.#frame, range), via };
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
      this.#activationRect = frameViewportRect(this.#frame, matched.range);
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

function scrollingRoot(document: Document): Element {
  return document.scrollingElement ?? document.documentElement;
}

function scrollProgression(document: Document): number {
  const root = scrollingRoot(document);
  const extent = root.scrollHeight - root.clientHeight;
  return extent > 0 ? Math.max(0, Math.min(1, root.scrollTop / extent)) : 0;
}

function parentElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
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
