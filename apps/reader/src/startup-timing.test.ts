import { describe, expect, it, vi } from "vitest";

import { startReaderStartupTiming } from "./startup-timing.js";

describe("payload-free startup timings", () => {
  it("does not fail loading when User Timing is unavailable", () => {
    const measure = vi.spyOn(performance, "measure").mockImplementation(() => {
      throw new Error("unsupported");
    });
    try {
      expect(() => startReaderStartupTiming("connection")("ready")).not.toThrow();
    } finally {
      measure.mockRestore();
    }
  });
  it("finishes once and retains only the latest measurement for a stage", () => {
    const name = "reader:startup:first-page:ready";
    const finish = startReaderStartupTiming("first-page");
    finish();
    finish();
    expect(performance.getEntriesByName(name)).toHaveLength(1);
    startReaderStartupTiming("first-page")();
    expect(performance.getEntriesByName(name)).toHaveLength(1);
    performance.clearMeasures(name);
  });
  it("distinguishes cancellation without recording error messages or identifiers", () => {
    const finish = startReaderStartupTiming("source");
    finish("cancelled");
    finish("ready");
    expect(performance.getEntriesByName("reader:startup:source:cancelled")).toHaveLength(1);
    expect(performance.getEntriesByName("reader:startup:source:ready")).toHaveLength(0);
    performance.clearMeasures("reader:startup:source:cancelled");
  });
});
