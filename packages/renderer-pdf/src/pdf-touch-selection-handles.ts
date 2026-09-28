import { glyphAt, SelectionPlugin } from "@embedpdf/plugin-selection";
import { DocumentManagerPlugin, ScrollPlugin } from "@embedpdf/react-pdf-viewer";

import { PdfSelectionWriter } from "./pdf-selection-writer.js";
import {
  compareGlyphs,
  edgeVelocity,
  fullPage,
  glyphRect,
  pagePoint,
  rangeFromEndpoints,
  rectDistance,
} from "./pdf-touch-selection-geometry.js";
import { TouchSelectionView } from "./pdf-touch-selection-view.js";

import type { PdfSelectionAdjustment } from "./pdf-selection-publication.js";
import type { TouchHandle } from "./pdf-touch-selection-view.js";
import type { PdfPageGeometry, Position, Rect, Rotation } from "@embedpdf/models";
import type { GlyphPointer, SelectionCapability } from "@embedpdf/plugin-selection";
import type { EmbedPdfContainer, PluginRegistry } from "@embedpdf/react-pdf-viewer";
import type { Unsubscribe } from "@mdbase-reader/reading-surface";

interface Drag {
  readonly pointerId: number;
  readonly handle: TouchHandle;
  readonly fixed: GlyphPointer;
  readonly offset: Position;
  moving: GlyphPointer;
  client: Position;
}
interface Dependencies {
  readonly host: EmbedPdfContainer;
  readonly registry: PluginRegistry;
  readonly selection: SelectionCapability;
  readonly scroll: ReturnType<ScrollPlugin["provides"]>;
  readonly documents: ReturnType<DocumentManagerPlugin["provides"]>;
  readonly adjustment: (phase: PdfSelectionAdjustment) => void;
}

export function installTouchSelectionHandles(input: {
  host: EmbedPdfContainer;
  registry: PluginRegistry;
  adjustment: (phase: PdfSelectionAdjustment) => void;
}): Unsubscribe {
  const { host, registry } = input;
  const selection = registry.getPlugin<SelectionPlugin>(SelectionPlugin.id)?.provides();
  const scroll = registry.getPlugin<ScrollPlugin>(ScrollPlugin.id)?.provides();
  const documents = registry.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)?.provides();
  if (!host.shadowRoot || !selection || !scroll || !documents) {
    return () => undefined;
  }
  return new TouchSelectionHandles(
    { ...input, selection, scroll, documents },
    new TouchSelectionView(host.shadowRoot),
  ).listen();
}

class TouchSelectionHandles {
  #disposed = false;
  #drag: Drag | null = null;
  #frame = 0;
  #lastTime = 0;
  readonly #writer: PdfSelectionWriter;
  #finishing = false;
  readonly #geometry = new Map<number, PdfPageGeometry>();
  readonly #loading = new Set<number>();
  readonly #failedGeometry = new Set<number>();

  public constructor(
    private readonly input: Dependencies,
    private readonly view: TouchSelectionView,
  ) {
    this.#writer = new PdfSelectionWriter(input.selection);
  }

  public listen(): Unsubscribe {
    const { host, selection, scroll } = this.input;
    // Scroll's layout event describes unscaled pages; zoom can resize the content without it.
    const resized = new ResizeObserver(this.#render);
    resized.observe(this.view.overlay);
    const document = host.ownerDocument;
    const window = document.defaultView;
    const interrupted = (): void => this.#finish();
    const visibilityChanged = (): void => {
      if (document.hidden) {
        this.#finish();
      }
    };
    window?.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", visibilityChanged);
    const events: readonly [string, EventListener][] = [
      ["pointerdown", this.#down as EventListener],
      ["pointermove", this.#move as EventListener],
      ["pointerup", this.#up as EventListener],
      ["pointercancel", this.#up as EventListener],
      ["lostpointercapture", this.#up as EventListener],
      ["click", this.#click],
      ["contextmenu", this.#click],
      ["keydown", this.#key as EventListener],
      ["touchmove", this.#touchMove as EventListener],
    ];
    events.forEach(([type, listener]) =>
      host.addEventListener(type, listener, { capture: true, passive: false }),
    );
    const stops = [
      selection.onSelectionChange(({ selection: range }) => {
        const change = this.#writer.observe(range);
        if (change === "obsolete") {
          return;
        }
        if (change === "external") {
          this.#finish();
        }
        this.#render();
      }),
      selection.onEndSelection(this.#render),
      scroll.onLayoutChange(this.#render),
    ];
    return () => {
      this.#disposed = true;
      this.#writer.dispose();
      this.#finish();
      resized.disconnect();
      window?.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", visibilityChanged);
      stops.forEach((stop) => stop());
      events.forEach(([type, listener]) => host.removeEventListener(type, listener, true));
      this.view.destroy();
      this.#geometry.clear();
    };
  }

  #getGeometry(page: number): PdfPageGeometry | undefined {
    return this.input.selection.getState().geometry[page] ?? this.#geometry.get(page);
  }

  #ensureGeometry(page: number): void {
    if (this.#getGeometry(page) || this.#loading.has(page) || this.#failedGeometry.has(page)) {
      return;
    }
    const doc = this.input.documents.getActiveDocument();
    const object = doc?.pages[page];
    if (!doc || !object) {
      return;
    }
    this.#loading.add(page);
    void this.input.registry
      .getEngine()
      .getPageGeometry(doc, object)
      .toPromise()
      .then((value) => {
        if (this.#disposed) {
          return;
        }
        const oldest = this.#geometry.keys().next().value;
        if (this.#geometry.size >= 8 && oldest !== undefined) {
          this.#geometry.delete(oldest);
        }
        this.#geometry.set(page, value);
      })
      // A failed page must not be retried on every animation frame. A new gesture may retry.
      .catch(() => {
        if (!this.#disposed) {
          this.#failedGeometry.add(page);
        }
      })
      .finally(() => this.#loading.delete(page));
  }

  readonly #render = (): void => {
    if (this.#disposed) {
      return;
    }
    const state = this.input.selection.getState();
    this.view.overlay.hidden = !state.selection || state.selecting;
    if (!state.selection || !this.view.attach()) {
      return;
    }
    const { handles } = this.view;
    // DOM identity and pointer capture stay with the finger when endpoints cross.
    if (this.#drag) {
      const movingEnd = compareGlyphs(this.#drag.moving, this.#drag.fixed) < 0 ? "start" : "end";
      if (handles[movingEnd] !== this.#drag.handle) {
        [handles.start, handles.end] = [handles.end, handles.start];
      }
    }
    for (const end of ["start", "end"] as const) {
      const pointer = state.selection[end];
      this.view.place(
        end,
        glyphRect(this.#getGeometry(pointer.page), pointer.index),
        (origin) =>
          this.input.scroll.getRectPositionForPage(pointer.page, {
            origin,
            size: { width: 0, height: 0 },
          })?.origin ?? null,
      );
    }
  };

  #hitTest(point: Position): GlyphPointer | null {
    const { documents, scroll } = this.input;
    const docId = documents.getActiveDocumentId();
    const doc = docId ? documents.getDocumentState(docId) : null;
    if (!doc?.document) {
      return null;
    }
    let closest: { page: number; rect: Rect; rotation: Rotation; distance: number } | null = null;
    for (const page of scroll.getMetrics().renderedPageIndexes) {
      const object = doc.document.pages[page];
      if (!object) {
        continue;
      }
      const rect = scroll.getRectPositionForPage(page, fullPage(object.size));
      if (!rect) {
        continue;
      }
      const distance = rectDistance(point, rect);
      if (!closest || distance < closest.distance) {
        closest = { page, rect, rotation: (object.rotation + doc.rotation) % 4, distance };
      }
    }
    if (!closest) {
      return null;
    }
    this.#ensureGeometry(closest.page);
    const geo = this.#getGeometry(closest.page);
    if (!geo) {
      return null;
    }
    const index = glyphAt(geo, pagePoint(point, closest.rect, closest.rotation, doc.scale), 2);
    return index < 0 ? null : { page: closest.page, index };
  }

  #update(): void {
    const drag = this.#drag;
    if (!drag || !this.view.scroller) {
      return;
    }
    const bounds = this.view.scroller.getBoundingClientRect();
    const moving = this.#hitTest({
      x: drag.client.x + drag.offset.x - bounds.left,
      y: drag.client.y + drag.offset.y - bounds.top,
    });
    if (!moving || compareGlyphs(moving, drag.moving) === 0) {
      return;
    }
    drag.moving = moving;
    this.#writer.queue(rangeFromEndpoints(drag.fixed, moving));
  }

  readonly #tick = (time: number): void => {
    const drag = this.#drag;
    if (!drag) {
      return;
    }
    const dt = Math.min(32, time - (this.#lastTime || time)) / 1000;
    this.#lastTime = time;
    if (this.view.viewport) {
      const bounds = this.view.viewport.getBoundingClientRect();
      this.view.viewport.scrollBy({
        left: edgeVelocity(drag.client.x - bounds.left, bounds.width) * dt,
        top: edgeVelocity(drag.client.y - bounds.top, bounds.height) * dt,
        behavior: "instant",
      });
    }
    this.#update();
    this.#frame = requestAnimationFrame(this.#tick);
  };

  #finish(): void {
    if (!this.#drag) {
      return;
    }
    const old = this.#drag;
    this.#drag = null;
    cancelAnimationFrame(this.#frame);
    this.#lastTime = 0;
    delete old.handle.button.dataset["dragging"];
    if (old.handle.button.hasPointerCapture(old.pointerId)) {
      old.handle.button.releasePointerCapture(old.pointerId);
    }
    this.#publishAfterFlush();
  }

  #publishAfterFlush(): void {
    this.#finishing = true;
    void this.#writer.settled().finally(() => {
      this.#finishing = false;
      if (!this.#disposed) {
        this.#render();
        this.input.adjustment("end");
      }
    });
  }

  readonly #down = (event: PointerEvent): void => {
    if (this.#drag) {
      swallow(event);
      this.#finish();
      return;
    }
    const end = this.view.endpoint(event);
    if (!end) {
      this.#dismissForTouch(event);
      return;
    }
    swallow(event);
    const range = this.input.selection.getState().selection;
    if (
      !range ||
      !this.view.scroller ||
      this.#finishing ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return;
    }
    this.#failedGeometry.clear();
    const handle = this.view.handles[end];
    const bounds = this.view.scroller.getBoundingClientRect();
    this.#drag = {
      pointerId: event.pointerId,
      handle,
      fixed: range[end === "start" ? "end" : "start"],
      moving: range[end],
      client: { x: event.clientX, y: event.clientY },
      offset: {
        x: bounds.left + handle.focus.x - event.clientX,
        y: bounds.top + handle.focus.y - event.clientY,
      },
    };
    handle.button.setPointerCapture(event.pointerId);
    handle.button.dataset["dragging"] = "";
    this.input.adjustment("start");
    this.#frame = requestAnimationFrame(this.#tick);
  };

  #dismissForTouch(event: PointerEvent): void {
    if (event.pointerType !== "touch" || !event.isPrimary || !this.view.scroller) {
      return;
    }
    const path = event.composedPath();
    if (
      !path.includes(this.view.scroller) ||
      path.some(
        (target) =>
          target instanceof HTMLElement && target.matches('button, input, a, [role="button"]'),
      )
    ) {
      return;
    }
    // EmbedPDF briefly treats taps after a word-select as a potential triple click. A fresh
    // touch on the page should instead dismiss immediately and let the long-press adapter pan.
    if (this.input.selection.getState().selection) {
      this.input.selection.clear();
    }
  }

  readonly #move = (event: PointerEvent): void => {
    if (this.#drag?.pointerId !== event.pointerId) {
      return;
    }
    swallow(event);
    this.#drag.client = { x: event.clientX, y: event.clientY };
  };

  readonly #up = (event: PointerEvent): void => {
    if (this.#drag?.pointerId !== event.pointerId) {
      return;
    }
    swallow(event);
    if (event.type === "pointerup") {
      this.#drag.client = { x: event.clientX, y: event.clientY };
      this.#update();
    }
    this.#finish();
  };

  readonly #touchMove = (event: TouchEvent): void => {
    if (this.#drag) {
      swallow(event);
    }
  };
  readonly #click = (event: Event): void => {
    if (this.view.endpoint(event)) {
      swallow(event);
    }
  };

  readonly #key = (event: KeyboardEvent): void => {
    const end = this.view.endpoint(event);
    if (!end) {
      return;
    }
    if (event.key === "Escape") {
      swallow(event);
      this.input.selection.clear();
      return;
    }
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) ||
      this.#finishing ||
      this.#drag
    ) {
      return;
    }
    swallow(event);
    const range = this.input.selection.getState().selection;
    if (!range) {
      return;
    }
    const pointer = range[end];
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    if (!glyphRect(this.#getGeometry(pointer.page), pointer.index + delta)) {
      return;
    }
    const fixed = range[end === "start" ? "end" : "start"];
    const moving = { ...pointer, index: pointer.index + delta };
    const movingEnd = compareGlyphs(moving, fixed) < 0 ? "start" : "end";
    if (movingEnd !== end) {
      const handles = this.view.handles;
      [handles.start, handles.end] = [handles.end, handles.start];
    }
    this.input.adjustment("start");
    this.#writer.queue(rangeFromEndpoints(fixed, moving));
    this.#publishAfterFlush();
  };
}

function swallow(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}
