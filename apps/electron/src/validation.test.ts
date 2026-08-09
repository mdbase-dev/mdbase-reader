import { describe, expect, it } from "vitest";

import { safeExportName, validatedExternalUrl } from "./validation.js";

describe("Electron bridge validation", () => {
  it("rejects privileged and executable protocols", () => {
    expect(() => validatedExternalUrl("file:///etc/passwd")).toThrow();
    expect(() => validatedExternalUrl("javascript:alert(1)")).toThrow();
    expect(validatedExternalUrl("https://mdbase.dev/reader")).toBe("https://mdbase.dev/reader");
  });

  it("removes path traversal from export names", () => {
    expect(safeExportName("../../library.csl.json")).toBe("library.csl.json");
  });
});
