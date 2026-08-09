// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { sanitizePublicationMarkup } from "./epub-safe-fetch.js";

describe("sanitizePublicationMarkup", () => {
  it("removes active content without discarding publication structure", () => {
    const sanitized = sanitizePublicationMarkup(
      `<!doctype html><html><head>
      <link rel="stylesheet" href="data:text/css,body%7B%7D"><link rel="preload" href="data:text/javascript,void%200">
      <meta http-equiv="refresh" content=""><script src="data:text/javascript,void%200"></script>
      </head><body onload="steal()"><p id="kept">Readable text</p>
      <a href=" javascript:steal() " ping="https://bad.test">unsafe</a>
      <img src="data:image/png;base64," onerror="steal()"><iframe src="data:text/html,"></iframe>
      <form action="/submit"><input autofocus></form></body></html>`,
      "text/html",
    );
    const document = new DOMParser().parseFromString(sanitized, "text/html");

    expect(document.querySelector("#kept")?.textContent).toBe("Readable text");
    expect(document.querySelector("link[rel=stylesheet]")).not.toBeNull();
    expect(
      document.querySelector("link[rel=preload], meta[http-equiv], script, iframe, form"),
    ).toBeNull();
    expect(document.body.hasAttribute("onload")).toBe(false);
    expect(document.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(document.querySelector("a")?.hasAttribute("ping")).toBe(false);
    expect(document.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,");
    expect(document.querySelector("img")?.hasAttribute("onerror")).toBe(false);
  });
});
