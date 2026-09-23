import { dateTime } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { readingWithStatus } from "./reading-status.js";

const started = dateTime("2026-09-01T09:00:00Z");
const now = dateTime("2026-09-24T10:00:00Z");

describe("readingWithStatus", () => {
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
