import { PdfTaskHelper } from "@embedpdf/models";
import { createEventEmitter } from "@mdbase-reader/reading-surface";
import { describe, expect, it, vi } from "vitest";

import { observePdfSelection } from "./pdf-selection-publication.js";

import type { PdfSelectionAdjustment } from "./pdf-selection-publication.js";
import type { EndSelectionEvent, SelectionChangeEvent } from "@embedpdf/plugin-selection";

function fixture(): {
  end: () => void;
  change: () => void;
  adjustments: ReturnType<typeof createEventEmitter<PdfSelectionAdjustment>>;
  selection: Parameters<typeof observePdfSelection>[0];
  text: ReturnType<typeof PdfTaskHelper.create<string[]>>;
} {
  const ends = createEventEmitter<EndSelectionEvent>();
  const changes = createEventEmitter<SelectionChangeEvent>();
  const adjustments = createEventEmitter<PdfSelectionAdjustment>();
  const text = PdfTaskHelper.create<string[]>();
  const rect = { origin: { x: 10, y: 20 }, size: { width: 100, height: 12 } };
  return {
    end: () => ends.emit({ documentId: "test", modeId: "pointerMode" }),
    change: () => changes.emit({ documentId: "test", modeId: "pointerMode", selection: null }),
    adjustments,
    text,
    selection: {
      onEndSelection: (listener: (event: EndSelectionEvent) => void) => ends.subscribe(listener),
      onSelectionChange: (listener: (event: SelectionChangeEvent) => void) =>
        changes.subscribe(listener),
      getFormattedSelection: () => [{ pageIndex: 0, rect, segmentRects: [rect] }],
      getSelectedText: () => text,
    },
  };
}

describe("PDF selection publication", () => {
  it("publishes adjusted quote and geometry on release without an engine end event", async () => {
    const f = fixture();
    const listener = vi.fn();
    const stop = observePdfSelection(f.selection, listener, f.adjustments);
    f.adjustments.emit("start");
    expect(listener).not.toHaveBeenCalled();
    f.adjustments.emit("end");
    f.text.resolve(["adjusted text"]);
    await Promise.resolve();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          quote: { exact: "adjusted text" },
          pdf: {
            pageIndex: 0,
            coordinateSpace: {
              profile: "embedpdf-selection-page-points-v1",
              box: "crop",
              origin: "top_left",
            },
            quadPoints: [[10, 20, 110, 20, 10, 32, 110, 32]],
          },
        },
      }),
    );
    stop();
  });

  it.each(["clear", "adjust", "destroy"])(
    "does not resurrect a late draft after %s",
    async (action) => {
      const f = fixture();
      const listener = vi.fn();
      const stop = observePdfSelection(f.selection, listener, f.adjustments);
      f.end();
      if (action === "clear") {
        f.change();
      }
      if (action === "adjust") {
        f.adjustments.emit("start");
      }
      if (action === "destroy") {
        stop();
      }
      f.text.resolve(["obsolete text"]);
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalled();
      stop();
    },
  );

  it("keeps the latest quote when engine tasks resolve out of order", async () => {
    const f = fixture();
    const newer = PdfTaskHelper.create<string[]>();
    const listener = vi.fn();
    const getSelectedText = vi.fn().mockReturnValueOnce(f.text).mockReturnValueOnce(newer);
    const stop = observePdfSelection({ ...f.selection, getSelectedText }, listener, f.adjustments);
    f.end();
    f.change();
    f.adjustments.emit("end");
    newer.resolve(["new"]);
    await Promise.resolve();
    f.text.resolve(["old"]);
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].target.quote.exact).toBe("new");
    stop();
  });

  it("does not read text when a release follows dismissal", () => {
    const f = fixture();
    const getSelectedText = vi.fn();
    const stop = observePdfSelection(
      { ...f.selection, getFormattedSelection: () => [], getSelectedText },
      vi.fn(),
      f.adjustments,
    );
    f.adjustments.emit("end");
    expect(getSelectedText).not.toHaveBeenCalled();
    stop();
  });
});
