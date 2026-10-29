// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { prepareHtmlDocument } from "./html-document.js";
import { sanitizedSvgImage } from "./svg-image.js";

const drawing = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><title>café 漢字 🐨</title><rect width="30" height="30" fill="blue"/></svg>`;

function decodedImage(url: string | null): Document {
  expect(url).toMatch(/^data:image\/svg\+xml,/u);
  return new DOMParser().parseFromString(decodeURIComponent(url!.split(",")[1]!), "image/svg+xml");
}

describe("sanitizedSvgImage", () => {
  it.each(["percent", "base64"])("preserves geometry and Unicode in %s images", (encoding) => {
    const url =
      encoding === "percent"
        ? `data:image/svg+xml,${encodeURIComponent(drawing)}`
        : `data:image/svg+xml;charset=utf-8;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(drawing)))}`;
    const svg = decodedImage(sanitizedSvgImage(url));
    expect(svg.documentElement.getAttribute("width")).toBe("30");
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("blue");
    expect(svg.querySelector("title")?.textContent).toBe("café 漢字 🐨");
  });

  it("strips scripts, event handlers, foreign content, animation, CSS and external references", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
      <script>alert(1)</script><foreignObject><iframe src="https://bad.example"/></foreignObject>
      <style>@import url(https://bad.example/style)</style>
      <a href="javascript:alert(1)"><text>Label</text></a>
      <image href="https://bad.example/pixel"/><use xlink:href="https://bad.example/file#icon"/>
      <rect width="30" height="30" fill="blue" onclick="alert(1)" style="fill:url(https://bad.example/paint)">
        <set attributeName="href" to="https://bad.example"/><animate attributeName="onload" values="alert(1)"/>
      </rect><path fill="url(https://bad.example/paint)" stroke="u\\72l(https://bad.example/stroke)"/>
      <defs><linearGradient id="gradient"><stop stop-color="blue"/></linearGradient></defs>
      <circle fill="url(#gradient)"/>
    </svg>`;
    const svg = decodedImage(sanitizedSvgImage(`data:image/svg+xml,${encodeURIComponent(source)}`));
    const clean = new XMLSerializer().serializeToString(svg);
    expect(clean).not.toMatch(
      /script|onload|onclick|foreignObject|iframe|<style|style=|href=|<set|<animate|bad\.example/iu,
    );
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("blue");
    expect(svg.querySelector("circle")?.getAttribute("fill")).toBe("url(#gradient)");
  });

  it.each([
    "data:image/svg+xml,%zz",
    "data:image/svg+xml;base64,!!!!",
    "data:image/svg+xml,%3Csvg",
    "data:image/svg+xml,%3Chtml/%3E",
    `data:image/svg+xml,${encodeURIComponent('<!DOCTYPE svg [<!ENTITY x "boom">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>')}`,
    "https://bad.example/image.svg",
    "data:text/html,<svg/>",
  ])("rejects malformed or non-SVG input: %s", (url) => {
    expect(sanitizedSvgImage(url)).toBeNull();
    const html = new DOMParser().parseFromString(
      prepareHtmlDocument(`<img src='${url}'>`),
      "text/html",
    );
    expect(html.querySelector("img")?.hasAttribute("src")).toBe(false);
  });

  it("is stable across capture and rendering passes and keeps the restrictive document CSP", () => {
    const once = prepareHtmlDocument(
      `<img src="data:image/svg+xml,${encodeURIComponent(drawing)}">`,
    );
    const twice = prepareHtmlDocument(once);
    const parsed = new DOMParser().parseFromString(twice, "text/html");
    expect(parsed.querySelector("img")?.getAttribute("src")).toBe(
      new DOMParser().parseFromString(once, "text/html").querySelector("img")?.getAttribute("src"),
    );
    expect(
      parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content"),
    ).toBe(
      "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'",
    );
    const unsafeLocation = new DOMParser().parseFromString(
      prepareHtmlDocument(
        `<iframe src="data:image/svg+xml,${encodeURIComponent(drawing)}"></iframe><video poster="data:image/svg+xml,${encodeURIComponent(drawing)}"></video>`,
      ),
      "text/html",
    );
    expect(unsafeLocation.querySelector("iframe")).toBeNull();
    expect(unsafeLocation.querySelector("video")?.hasAttribute("poster")).toBe(false);
  });
});
