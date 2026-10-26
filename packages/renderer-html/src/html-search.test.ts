// @vitest-environment happy-dom
import { fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { HtmlDocumentRuntime } from "./html-runtime.js";
import { HtmlReadingSurface } from "./html-surface.js";

const target = {
  fileId: fileId("html"),
  file: "page.html",
  revision: fileRevision(`sha256:${"a".repeat(64)}`),
};
function fixture(text: string): {
  runtime: HtmlDocumentRuntime;
  surface: HtmlReadingSurface;
  scroll: ReturnType<typeof vi.fn>;
  frame: HTMLIFrameElement;
  highlight: ReturnType<typeof vi.fn>;
} {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.body.innerHTML = `<main><p>${text}</p></main>`;
  const view = frame.contentWindow!;
  const scroll = vi.fn();
  const highlight = vi.fn();
  Object.defineProperty(view, "scrollTo", { value: scroll, configurable: true });
  Object.defineProperty(view, "Highlight", { value: vi.fn(), configurable: true });
  Object.defineProperty(view, "CSS", {
    value: { highlights: { set: highlight, delete: vi.fn() } },
    configurable: true,
  });
  const runtime = new HtmlDocumentRuntime(frame, "page.html");
  return {
    runtime,
    scroll,
    frame,
    highlight,
    surface: new HtmlReadingSurface(
      { document: target, mediaType: "text/html", url: "page" },
      runtime,
    ),
  };
}
describe("HTML search navigation", () => {
  it("scrolls a strict quotation range and draws a separate transient highlight", async () => {
    const { runtime, surface, scroll, highlight, frame } = fixture(
      "Before matching <em>passage</em> after.",
    );
    expect(
      await surface.capabilities.searchNavigation?.goToDestination({
        document: target,
        location: { kind: "html" },
        quote: { exact: "matching passage" },
      }),
    ).toBe(true);
    expect(scroll).toHaveBeenCalled();
    expect(highlight).toHaveBeenCalledWith("reader-search-passage", expect.anything());
    runtime.destroy();
    frame.remove();
  });
  it.each(["Changed passage", "matching passage matching passage"])(
    "does not scroll on failed evidence: %s",
    async (text) => {
      const { surface, scroll, frame } = fixture(text);
      expect(
        await surface.capabilities.searchNavigation?.goToDestination({
          document: target,
          location: { kind: "html" },
          quote: { exact: "matching passage" },
        }),
      ).toBe(false);
      expect(scroll).not.toHaveBeenCalled();
      await surface.destroy();
      frame.remove();
    },
  );
  it("does not scroll to a quote from a different revision", async () => {
    const { surface, scroll, frame } = fixture("matching passage");
    expect(
      await surface.capabilities.searchNavigation?.goToDestination({
        document: { ...target, revision: fileRevision(`sha256:${"b".repeat(64)}`) },
        location: { kind: "html" },
        quote: { exact: "matching passage" },
      }),
    ).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
    await surface.destroy();
    frame.remove();
  });
});
