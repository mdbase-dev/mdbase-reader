import { describe, expect, it } from "vitest";

import { hasDocumentSearchIntent } from "./use-session-document-search.js";

describe("hasDocumentSearchIntent", () => {
  it("defers document extraction until the user searches", () => {
    expect(hasDocumentSearchIntent("")).toBe(false);
    expect(hasDocumentSearchIntent("  \n")).toBe(false);
    expect(hasDocumentSearchIntent("attention")).toBe(true);
  });
});
