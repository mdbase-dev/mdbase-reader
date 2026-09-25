import {
  MarginMarkers,
  forwardApplicationShortcut,
  locateTextQuote,
} from "@mdbase-reader/reading-surface";

import type { Annotation, AnnotationId } from "@mdbase-reader/core";

/**
 * Readium renders each spread in its own frame. For every frame as it appears, forward
 * application shortcuts to Reader (key events otherwise stay in the focused frame) and draw
 * margin marks beside annotated passages found in that frame's text.
 */
export class EpubFrameEnhancements {
  readonly #container: HTMLElement;
  readonly #frames = new Map<
    Document,
    { readonly markers: MarginMarkers; readonly stop: () => void }
  >();
  readonly #observer: MutationObserver;
  readonly #listeners = new Set<(id: AnnotationId) => void>();
  readonly #clearedListeners = new Set<() => void>();
  #hasSelection = false;
  #annotations: readonly Annotation[] = [];
  #activeId: AnnotationId | null = null;

  public constructor(container: HTMLElement) {
    this.#container = container;
    this.#observer = new MutationObserver(this.#attach);
    this.#observer.observe(container, { childList: true, subtree: true });
    // Frames load their content after insertion; `load` does not bubble, so capture it.
    container.addEventListener("load", this.#attach, true);
    this.#attach();
  }

  /** Clicks on margin marks, reported like clicks on highlights. */
  public onActivated(listener: (id: AnnotationId) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** A selection in any frame collapsed, or a click there left nothing selected. */
  public onSelectionCleared(listener: () => void): () => void {
    this.#clearedListeners.add(listener);
    return () => this.#clearedListeners.delete(listener);
  }

  public setAnnotations(annotations: readonly Annotation[]): void {
    this.#annotations = annotations;
    for (const [document, frame] of this.#frames) {
      this.#mark(document, frame.markers);
    }
  }

  public setActive(id: AnnotationId | null): void {
    this.#activeId = id;
    for (const { markers } of this.#frames.values()) {
      markers.setActive(id);
    }
  }

  public destroy(): void {
    this.#observer.disconnect();
    this.#container.removeEventListener("load", this.#attach, true);
    for (const { markers, stop } of this.#frames.values()) {
      stop();
      markers.destroy();
    }
    this.#frames.clear();
    this.#listeners.clear();
    this.#clearedListeners.clear();
  }

  readonly #attach = (): void => {
    const live = new Set<Document>();
    for (const frame of this.#container.querySelectorAll<HTMLIFrameElement>("iframe")) {
      const document = frame.contentDocument;
      if (!document?.body) {
        continue;
      }
      live.add(document);
      if (!this.#frames.has(document)) {
        this.#frames.set(document, this.#enhance(document));
      }
    }
    // Readium replaces frames as the reader moves through the book.
    for (const [document, { markers, stop }] of this.#frames) {
      if (!live.has(document)) {
        stop();
        markers.destroy();
        this.#frames.delete(document);
      }
    }
  };

  #enhance(document: Document): { readonly markers: MarginMarkers; readonly stop: () => void } {
    const host = this.#container.ownerDocument;
    const onKeyDown = (event: KeyboardEvent): void => forwardApplicationShortcut(event, host);
    const onPointerUp = (): void => this.#noteSelection(document, true);
    const onKeyUp = (): void => this.#noteSelection(document, false);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keyup", onKeyUp);
    const markers = new MarginMarkers(document, (id) =>
      this.#listeners.forEach((listener) => listener(id)),
    );
    this.#mark(document, markers);
    markers.setActive(this.#activeId);
    const reflow = new ResizeObserver(() => markers.layout());
    reflow.observe(document.body);
    return {
      markers,
      stop: () => {
        reflow.disconnect();
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("keyup", onKeyUp);
      },
    };
  }

  #noteSelection(document: Document, pointer: boolean): void {
    const selection = document.defaultView?.getSelection();
    if (selection && !selection.isCollapsed) {
      this.#hasSelection = true;
    } else if (this.#hasSelection || pointer) {
      this.#hasSelection = false;
      this.#clearedListeners.forEach((listener) => listener());
    }
  }

  #mark(document: Document, markers: MarginMarkers): void {
    markers.set(
      this.#annotations.flatMap((annotation) => {
        const quote = annotation.target?.epub ? annotation.target.quote : undefined;
        const range = quote ? locateTextQuote(document.body, quote) : null;
        return range
          ? [{ id: annotation.id, range, hasNote: hasWrittenNote(annotation.body) }]
          : [];
      }),
    );
  }
}

/** Whether an annotation carries the reader's own words, beyond the quoted passage. */
function hasWrittenNote(body: string): boolean {
  return body.split("\n").some((line) => line.trim() !== "" && !line.trimStart().startsWith(">"));
}

export function clearFrameSelections(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLIFrameElement>(".readium-navigator-iframe")
    .forEach((frame) => frame.contentWindow?.getSelection()?.removeAllRanges());
}
