// @vitest-environment happy-dom
import { annotationId } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareHtmlDocument } from "./html-document.js";
import { HtmlDocumentRuntime } from "./html-runtime.js";

import type { Annotation } from "@mdbase-reader/core";

const page = prepareHtmlDocument(`<body><article><h1>Essay</h1><h2>Method</h2>
  <p>The article itself, which is always shown.</p></article>
  <aside data-reader-outside=""><h2>Related</h2><p>A sidebar passage highlighted on the live page.</p></aside>
  <header data-reader-outside=""><ul><li><a>World news</a></li><li><a>Middle East</a></li></ul><span>Sign in</span></header></body>`);

function runtime(): { runtime: HtmlDocumentRuntime; document: Document } {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const frameDocument = frame.contentDocument;
  if (!frameDocument) {
    throw new Error("No frame document.");
  }
  frameDocument.body.innerHTML = new DOMParser().parseFromString(page, "text/html").body.innerHTML;
  return { runtime: new HtmlDocumentRuntime(frame, "essay.html"), document: frameDocument };
}

const highlight = (exact: string): Annotation =>
  ({
    id: annotationId(`ann-${exact.replace(/\W+/gu, "-")}`),
    color: "yellow",
    body: "",
    target: { quote: { exact } },
  }) as unknown as Annotation;

afterEach(() => {
  document.body.replaceChildren();
});

describe("HtmlDocumentRuntime page text outside the article", () => {
  it("interrupts native page scrolling for document-edge navigation, not editing", () => {
    const { runtime: reader, document: frame } = runtime();
    const scroll = vi.spyOn(frame.defaultView!, "scrollTo");
    const home = new KeyboardEvent("keydown", {
      key: "Home",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    frame.body.dispatchEvent(home);
    expect(home.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });
    const input = frame.createElement("input");
    frame.body.append(input);
    scroll.mockClear();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(scroll).not.toHaveBeenCalled();
    const button = frame.createElement("button");
    frame.body.append(button);
    const activate = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(activate);
    expect(activate.defaultPrevented).toBe(false);
    const selectPage = new KeyboardEvent("keydown", {
      key: "PageDown",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    frame.body.dispatchEvent(selectPage);
    expect(selectPage.defaultPrevented).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
    reader.destroy();
  });
  it("shows a hidden section while a highlight sits in it, and hides it again after", () => {
    const { runtime: reader, document: frame } = runtime();
    const aside = frame.querySelector("aside");
    expect(aside?.hasAttribute("data-reader-revealed")).toBe(false);

    reader.setAnnotations([highlight("A sidebar passage highlighted")]);
    expect(aside?.getAttribute("data-reader-revealed")).toBe("path");
    expect(frame.querySelector("aside p")?.getAttribute("data-reader-revealed")).toBe("all");
    expect(frame.querySelector("aside h2")?.hasAttribute("data-reader-revealed")).toBe(false);

    reader.setAnnotations([highlight("always shown")]);
    expect(aside?.hasAttribute("data-reader-revealed")).toBe(false);
    reader.destroy();
  });

  it("shows only the menu item a highlight is in, not the whole menu", () => {
    const { runtime: reader, document: frame } = runtime();
    reader.setAnnotations([highlight("Middle East")]);
    const items = [...frame.querySelectorAll("header li")];
    expect(items.map((item) => item.getAttribute("data-reader-revealed"))).toEqual([null, "all"]);
    expect(frame.querySelector("header")?.getAttribute("data-reader-revealed")).toBe("path");
    expect(frame.querySelector("header ul")?.getAttribute("data-reader-revealed")).toBe("path");
    expect(frame.querySelector("header > span")?.hasAttribute("data-reader-revealed")).toBe(false);
    reader.destroy();
  });

  it("leaves hidden headings out of the contents and hidden text out of extracted text", () => {
    const { runtime: reader } = runtime();
    expect(reader.contents().map((entry) => entry.title)).toEqual(["Essay", "Method"]);
    expect(reader.extractText()).not.toContain("sidebar");
    reader.destroy();
  });
});
