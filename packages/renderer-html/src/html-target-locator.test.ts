// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { HtmlTargetLocator } from "./html-range.js";

describe("cached HTML targets", () => {
  it("shares text indexes per root and ranges across equivalent targets", () => {
    document.body.innerHTML = "<main><p>First passage and second passage.</p></main>";
    const walker = vi.spyOn(document, "createTreeWalker");
    const locator = new HtmlTargetLocator(document);
    try {
      const target = { quote: { exact: "First passage" }, html: { css: "main" } };
      const first = locator.locate(target);
      expect(first?.toString()).toBe("First passage");
      expect(locator.locate({ ...target, quote: { ...target.quote } })).toBe(first);
      expect(
        locator.locate({ quote: { exact: "second passage" }, html: { css: "main" } })?.toString(),
      ).toBe("second passage");
      expect(walker).toHaveBeenCalledOnce();
      document.body.style.fontSize = "20px";
      expect(locator.locate(target)).toBe(first);
      expect(walker).toHaveBeenCalledOnce();
    } finally {
      locator.destroy();
      walker.mockRestore();
    }
  });

  it("invalidates synchronously after text edits and caches missing matches only until mutation", () => {
    document.body.innerHTML = "<p>Before old passage.</p>";
    const locator = new HtmlTargetLocator(document);
    try {
      const target = { quote: { exact: "new passage" } };
      expect(locator.locate(target)).toBeNull();
      document.querySelector("p")!.firstChild!.textContent = "After new passage.";
      expect(locator.locate(target)?.toString()).toBe("new passage");
      document.querySelector("p")!.replaceChildren(document.createTextNode("Changed new passage."));
      expect(locator.locate(target)?.startContainer.textContent).toBe("Changed new passage.");
    } finally {
      locator.destroy();
    }
  });

  it("invalidates after asynchronous mutations and follows changed CSS roots", async () => {
    document.body.innerHTML = '<p id="selected">first passage</p><p>second passage</p>';
    const locator = new HtmlTargetLocator(document);
    try {
      const target = { quote: { exact: "passage" }, html: { css: "#selected" } };
      expect(locator.locate(target)?.startContainer.textContent).toBe("first passage");
      document.querySelector("#selected")!.removeAttribute("id");
      document.querySelectorAll("p")[1]!.id = "selected";
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(locator.locate(target)?.startContainer.textContent).toBe("second passage");
    } finally {
      locator.destroy();
    }
  });
});
