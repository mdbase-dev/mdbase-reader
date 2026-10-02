/* eslint-disable @typescript-eslint/require-await -- the work under test is async by contract */
import { getMdbaseMarkActivity, resetMdbaseMarkActivity } from "@mdbase-dev/ui/mark-activity";
import { sourceId, type SourceSummary } from "@mdbase-reader/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { markFraction, withMarkProgress } from "./mark-activity.js";
import { eachSource } from "./use-library-writes.js";

import type { BulkStatusProgress } from "./LibraryBulkBar.js";

const mark = (): ReturnType<typeof getMdbaseMarkActivity> => getMdbaseMarkActivity();

beforeEach(() => resetMdbaseMarkActivity());
afterEach(() => resetMdbaseMarkActivity());

describe("withMarkProgress", () => {
  it("fills the mark while the work reports progress, then plays saved", async () => {
    let seen: number | null = null;
    const result = await withMarkProgress(async (update) => {
      update(0.4);
      seen = mark().progress;
      return "done";
    });
    expect(result).toBe("done");
    expect(seen).toBe(0.4);
    expect(mark().progress).toBeNull();
    expect(mark().signal?.kind).toBe("saved");
  });

  it("ends the way the result says", async () => {
    await withMarkProgress(
      async () => null,
      () => "fail",
    );
    expect(mark()).toMatchObject({ progress: null, signal: { kind: "error" } });
    resetMdbaseMarkActivity();
    await withMarkProgress(
      async () => null,
      () => "cancel",
    );
    expect(mark()).toMatchObject({ progress: null, signal: null });
  });

  it("plays error when the work throws, and rethrows", async () => {
    await expect(
      withMarkProgress(async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(mark()).toMatchObject({ progress: null, signal: { kind: "error" } });
  });

  it("stops quietly when the work was aborted", async () => {
    const controller = new AbortController();
    await expect(
      withMarkProgress(
        async () => {
          controller.abort();
          throw new DOMException("Stopped", "AbortError");
        },
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow("Stopped");
    expect(mark()).toMatchObject({ progress: null, signal: null });
  });

  it("never leaves the mark filling when deciding the outcome throws", async () => {
    await expect(
      withMarkProgress(
        async () => 1,
        () => {
          throw new Error("bad outcome");
        },
      ),
    ).rejects.toThrow("bad outcome");
    expect(mark().progress).toBeNull();
  });
});

describe("markFraction", () => {
  it("is the share done, and nothing of nothing", () => {
    expect(markFraction(3, 4)).toBe(0.75);
    expect(markFraction(0, 0)).toBe(0);
  });
});

describe("a bulk library update on the mark", () => {
  const sources = ["a", "b", "c", "d"].map(
    (id) => ({ id: sourceId(id) }) as unknown as SourceSummary,
  );

  it("fills with each source written and plays saved when all succeed", async () => {
    const fills: (number | null)[] = [];
    const reports: BulkStatusProgress[] = [];
    await eachSource(
      sources,
      (value) => {
        reports.push(value);
        fills.push(mark().progress);
      },
      async () => undefined,
    );
    expect(reports.at(-1)).toEqual({ done: 4, total: 4, failed: 0 });
    expect(fills).toEqual([0.25, 0.5, 0.75, 1]);
    expect(mark()).toMatchObject({ progress: null, signal: { kind: "saved" } });
  });

  it("plays error when any source could not be updated", async () => {
    const reports: BulkStatusProgress[] = [];
    await eachSource(
      sources,
      (value) => reports.push(value),
      async (source) => {
        if (source.id === sourceId("c")) {
          throw new Error("conflict");
        }
      },
    );
    expect(reports.at(-1)).toEqual({ done: 4, total: 4, failed: 1 });
    expect(mark()).toMatchObject({ progress: null, signal: { kind: "error" } });
  });

  it("leaves the mark alone for an empty selection", async () => {
    await eachSource(
      [],
      () => undefined,
      async () => undefined,
    );
    expect(mark()).toMatchObject({ progress: null, signal: null });
  });
});
