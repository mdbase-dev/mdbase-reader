// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { inlinePublicationResources } from "./epub-resource-inlining.js";

const base = "https://reader.test/__mdbase-reader/epub/session/OEBPS/chapter.xhtml";

const browserSettings = (
  window as unknown as Window & {
    happyDOM: {
      settings: { disableCSSFileLoading: boolean; handleDisabledFileLoadingAsSuccess: boolean };
    };
  }
).happyDOM.settings;
browserSettings.disableCSSFileLoading = true;
browserSettings.handleDisabledFileLoadingAsSuccess = true;

describe("inlinePublicationResources", () => {
  it("embeds publisher CSS, CSS assets, and document images", async () => {
    const document = new DOMParser().parseFromString(
      `<html xmlns="http://www.w3.org/1999/xhtml"><head>
        <link rel="stylesheet" href="styles/book.css" />
      </head><body style="background-image:url(images/paper.png)">
        <img src="images/figure.png" srcset="https://tracker.test/figure.png 2x" />
      </body></html>`,
      "application/xml",
    );
    const fetchResource = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
      if (url.endsWith("book.css")) {
        return Promise.resolve(
          new Response("@font-face{src:url('../fonts/book.woff2')} body{color:#222}", {
            headers: { "content-type": "text/css" },
          }),
        );
      }
      const type = url.endsWith("woff2") ? "font/woff2" : "image/png";
      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": type } }),
      );
    });

    await inlinePublicationResources(document, base, fetchResource);

    expect(document.querySelector("link")).toBeNull();
    expect(document.querySelector("style")?.textContent).toContain("data:font/woff2;base64,AQID");
    expect(document.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AQID");
    expect(document.querySelector("img")?.hasAttribute("srcset")).toBe(false);
    expect(document.body.getAttribute("style")).toContain("data:image/png;base64,AQID");
  });

  it("removes external resources without fetching them", async () => {
    const document = new DOMParser().parseFromString(
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="https://tracker.test/book.css" /></head>
      <body><img src="https://tracker.test/pixel.png" /><style>.x{background:url(https://tracker.test/x)}</style></body></html>`,
      "application/xml",
    );
    const fetchResource = vi.fn();

    await inlinePublicationResources(document, base, fetchResource);

    expect(fetchResource).not.toHaveBeenCalled();
    expect(document.querySelector("link")).toBeNull();
    expect(document.querySelector("img")?.hasAttribute("src")).toBe(false);
    expect(document.querySelector("style")?.textContent).toContain('url("")');
  });
});
