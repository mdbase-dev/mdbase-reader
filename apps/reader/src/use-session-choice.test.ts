// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { readSessionChoice, writeSessionChoice } from "./use-session-choice.js";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("session choices", () => {
  it("remembers an allowed value for the session", () => {
    writeSessionChoice("citation.style", "vancouver");
    expect(readSessionChoice("citation.style", ["apa", "vancouver"], "apa")).toBe("vancouver");
  });

  it("falls back for unknown or missing values", () => {
    writeSessionChoice("citation.style", "chicago");
    expect(readSessionChoice("citation.style", ["apa", "vancouver"], "apa")).toBe("apa");
    expect(readSessionChoice("never-set", ["open", "closed"], "closed")).toBe("closed");
  });

  it("survives blocked storage", () => {
    const blocked = (): never => {
      throw new Error("blocked");
    };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked });
    try {
      expect(() => writeSessionChoice("citation.style", "apa")).not.toThrow();
      expect(readSessionChoice("citation.style", ["apa", "vancouver"], "vancouver")).toBe(
        "vancouver",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
