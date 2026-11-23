import { describe, expect, it, vi } from "vitest";

import { forgetRetiredData } from "./forget-retired-data.js";

describe("forgetRetiredData", () => {
  it("deletes the databases of features that are gone", () => {
    const deleteDatabase = vi.fn();
    forgetRetiredData({ deleteDatabase });
    expect(deleteDatabase.mock.calls.map(([name]) => name as string)).toEqual([
      "mdbase-reader-offline-v1",
      "mdbase-reader-library-text-v1",
      "mdbase-reader-thumbnails-v1",
    ]);
  });

  it("does nothing where storage is unavailable", () => {
    expect(() => forgetRetiredData(undefined)).not.toThrow();
    expect(() =>
      forgetRetiredData({
        deleteDatabase: () => {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });
});
