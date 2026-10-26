// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { locateSearchQuote, locateTextQuote } from "./text-quote.js";

describe("locateTextQuote", () => {
  it("starts the range in the node where the quotation begins", () => {
    document.body.innerHTML = "<h1>Heading</h1>\n<p>Patient attention and durable notes.</p>";
    const range = locateTextQuote(document.body, { exact: "Patient attention" });
    expect(range?.startContainer.textContent).toBe("Patient attention and durable notes.");
    expect(range?.startOffset).toBe(0);
    expect(range?.toString()).toBe("Patient attention");
  });

  it("ends in the selected text node, not the following element at offset zero", () => {
    document.body.innerHTML = "<section><p>Chapter text</p></section><h2>Next chapter</h2>";
    for (const locate of [locateTextQuote, locateSearchQuote]) {
      const range = locate(document.body, { exact: "Chapter text" });
      expect(range?.endContainer).toBe(document.querySelector("p")!.firstChild);
      expect(range?.endOffset).toBe("Chapter text".length);
      expect(range?.toString()).toBe("Chapter text");
    }
  });

  it("prefers the occurrence whose context matches", () => {
    document.body.innerHTML = "<p>one alpha two</p><p>three alpha four</p>";
    const range = locateTextQuote(document.body, { exact: "alpha", prefix: "three " });
    expect(range?.startContainer.textContent).toBe("three alpha four");
  });
});
