import { dateTime, fileId } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { readingPatch, readingWithStatus } from "./reading-status.js";

const started = dateTime("2026-09-01T09:00:00Z");
const now = dateTime("2026-09-24T10:00:00Z");

describe("readingWithStatus", () => {
  it("stores range-relative progress without completing the source and clears unavailable measurements", () => {
    const input = {
      documentFileId: fileId("shared-book"),
      position: { kind: "pdf", pageIndex: 15 } as const,
      openedAt: now,
    };
    const original = { reading: { status: "queued", progress: 0.8 } };
    expect(readingPatch(original, { ...input, progress: 0.5 })).toMatchObject({
      progress: 0.5,
      status: "queued",
      position: { pdf: { page_index: 15 } },
    });
    expect(readingPatch(original, { ...input, progress: 1 })).toMatchObject({
      progress: 1,
      status: "queued",
    });
    expect(readingPatch(original, { ...input, progress: null })).not.toHaveProperty("progress");
    expect(readingPatch(original, input)).toHaveProperty("progress", 0.8);
  });

  it("records completion without moving an earlier start", () => {
    expect(readingWithStatus({ status: "reading", started_at: started }, "finished", now)).toEqual({
      status: "finished",
      started_at: started,
      finished_at: now,
    });
  });

  it("keeps finished_at from preceding started_at when a source was never started", () => {
    const reading = readingWithStatus({ status: "queued" }, "finished", now);
    expect(reading["started_at"]).toBe(now);
    expect(reading["finished_at"]).toBe(now);
  });

  it("clears completion when a finished source is reopened and keeps its position", () => {
    const position = { kind: "pdf", page_index: 4 };
    expect(
      readingWithStatus(
        { status: "finished", started_at: started, finished_at: now, position },
        "reading",
        now,
      ),
    ).toEqual({ status: "reading", started_at: started, position });
  });

  it("starts the clock when reading begins", () => {
    expect(readingWithStatus({ status: "inbox" }, "reading", now)).toEqual({
      status: "reading",
      started_at: now,
    });
  });
});
