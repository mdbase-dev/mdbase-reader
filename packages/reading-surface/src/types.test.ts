import { describe, expect, it, vi } from "vitest";

import { createEventEmitter } from "./events.js";

import type { AreaSelectionDraft, ReadingSurfaceCapabilities } from "./types.js";

describe("reading surface capability composition", () => {
  it("publishes selections without coupling a surface to persistence", () => {
    const selections = createEventEmitter<AreaSelectionDraft>();
    const listener = vi.fn();
    const unsubscribe = selections.subscribe(listener);
    const capabilities: ReadingSurfaceCapabilities = {
      areaSelection: {
        selections,
        beginAreaSelection: vi.fn(),
        cancelAreaSelection: vi.fn(),
      },
    };
    const selection: AreaSelectionDraft = {
      pageIndex: 1,
      rect: { x: 10, y: 20, width: 30, height: 40 },
      coordinateProfile: "renderer-points-v1",
      image: new Blob(),
      imageType: "image/png",
      scale: 2,
      withAnnotations: false,
    };

    capabilities.areaSelection?.selections.subscribe(vi.fn());
    selections.emit(selection);
    expect(listener).toHaveBeenCalledWith(selection);

    unsubscribe();
    selections.emit(selection);
    expect(listener).toHaveBeenCalledOnce();
  });
});
