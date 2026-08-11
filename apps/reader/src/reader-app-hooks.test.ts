import { describe, expect, it } from "vitest";

import { readerMainClass } from "./reader-app-hooks.js";

describe("readerMainClass", () => {
  it("keeps the contextual source tools open by default", () => {
    expect(readerMainClass(false, false, false)).toBe("reader-main");
  });

  it("tracks the library and source-tool panels independently", () => {
    expect(readerMainClass(true, false, true, false)).toBe(
      "reader-main is-library-open is-library-collapsed is-inspector-closed",
    );
  });
});
