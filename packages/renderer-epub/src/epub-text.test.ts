// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { readableMarkupText } from "./epub-text.js";

describe("EPUB text extraction", () => {
  it("keeps readable spine text and excludes executable or styling content", () => {
    const text = readableMarkupText(
      `<html xmlns="http://www.w3.org/1999/xhtml"><head>
        <style>.hidden { display: none }</style><script>secret()</script>
      </head><body><h1>Chapter one</h1><p>Attention crosses markup.</p></body></html>`,
      "application/xhtml+xml",
    );

    expect(text).toContain("Chapter one");
    expect(text).toContain("Attention crosses markup.");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("display");
  });
});
