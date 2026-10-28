// @vitest-environment happy-dom
import { annotationId } from "@mdbase-reader/core";
import { afterEach, describe, expect, it } from "vitest";

import { prepareHtmlDocument } from "./html-document.js";
import { HtmlDocumentRuntime } from "./html-runtime.js";

import type { Annotation } from "@mdbase-reader/core";

const page = prepareHtmlDocument(`<body><article><h1>Essay</h1><h2>Method</h2>
  <p>The article itself, which is always shown.</p></article>
  <aside data-reader-outside=""><h2>Related</h2><p>A sidebar passage highlighted on the live page.</p></aside></body>`);

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
  it("shows a hidden section while a highlight sits in it, and hides it again after", () => {
    const { runtime: reader, document: frame } = runtime();
    const aside = frame.querySelector("aside");
    expect(aside?.hasAttribute("data-reader-revealed")).toBe(false);

    reader.setAnnotations([highlight("A sidebar passage highlighted")]);
    expect(aside?.hasAttribute("data-reader-revealed")).toBe(true);

    reader.setAnnotations([highlight("always shown")]);
    expect(aside?.hasAttribute("data-reader-revealed")).toBe(false);
    reader.destroy();
  });

  it("leaves hidden headings out of the contents and hidden text out of extracted text", () => {
    const { runtime: reader } = runtime();
    expect(reader.contents().map((entry) => entry.title)).toEqual(["Essay", "Method"]);
    expect(reader.extractText()).not.toContain("sidebar");
    reader.destroy();
  });
});
