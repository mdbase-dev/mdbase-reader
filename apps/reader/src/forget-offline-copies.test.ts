import { describe, expect, it, vi } from "vitest";

import { forgetOfflineCopies } from "./forget-offline-copies.js";

describe("forgetOfflineCopies", () => {
  it("deletes the retired offline copy database", () => {
    const deleteDatabase = vi.fn();
    forgetOfflineCopies({ deleteDatabase });
    expect(deleteDatabase).toHaveBeenCalledWith("mdbase-reader-offline-v1");
  });

  it("does nothing where storage is unavailable", () => {
    expect(() => forgetOfflineCopies(undefined)).not.toThrow();
    expect(() =>
      forgetOfflineCopies({
        deleteDatabase: () => {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });
});
