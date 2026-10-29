// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { extractArchivedHtmlText, prepareHtmlDocument } from "./html-document.js";

describe("prepareHtmlDocument", () => {
  it("retains the embedded SVG image from the production import fixture", () => {
    const source = readFileSync(resolve(import.meta.dirname, "fixtures/imported-svg.html"), "utf8");
    const rendered = new DOMParser().parseFromString(prepareHtmlDocument(source), "text/html");
    const image = rendered.querySelector("img");
    expect(image?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/u);
    expect(image?.getAttribute("alt")).toBe("Test image");
    expect(rendered.querySelector("td")?.textContent).toBe("Alpha");
    expect(rendered.querySelector("code")?.textContent).toBe("const example = 42;");
    expect(rendered.body.textContent).toContain("Unicode: café 漢字 🐨");
  });
  it("shares background index text with the rendered document, without executing markup", () => {
    const source =
      "<head><title>Not body text</title><style>secret style</style></head><body><form><p>CAFÉ 世界文学</p><button>definition</button></form><script>secret script</script><textarea>secret input</textarea></body>";
    const rendered = new DOMParser().parseFromString(prepareHtmlDocument(source), "text/html");
    expect(extractArchivedHtmlText(source)).toBe(rendered.body.textContent);
    expect(extractArchivedHtmlText(source)).toBe("CAFÉ 世界文学definition");
  });
  it("removes executable and network-bearing content while retaining readable markup", () => {
    const prepared = prepareHtmlDocument(`<!doctype html><html><head>
      <script>window.bad = true</script>
      <style>@import url(https://bad.example/x.css); p { background:url(https://bad.example/x) }</style>
      </head><body onload="bad()"><main><h1>Essay</h1>
      <p onclick="bad()">Readable <a href="https://bad.example/">text</a>.</p>
      <img src="https://bad.example/pixel.png"><img src="data:image/png;base64,AAAA">
      <iframe srcdoc="bad"></iframe></main></body></html>`);

    expect(prepared).toContain("<h1>Essay</h1>");
    expect(prepared).toContain("data:image/png;base64,AAAA");
    expect(prepared).toContain("Content-Security-Policy");
    expect(prepared).toContain('data-mdbase-reader="document"');
    expect(prepared).toContain("::highlight(reader-active-annotation)");
    expect(prepared).not.toContain("<script");
    expect(prepared).not.toContain("<iframe");
    expect(prepared).not.toContain("onclick");
    expect(prepared).not.toContain("https://bad.example");
  });

  it("keeps prose that resembles attributes and the text inside forms and buttons", () => {
    const prepared = prepareHtmlDocument(`<body><form action="https://bad.example/post">
      <p>Set the form action = submit and the href=home value, then src=x.</p>
      <p>An inline <button onclick="bad()">definition</button> toggle.</p></form></body>`);
    const text = new DOMParser().parseFromString(prepared, "text/html").body.textContent;

    expect(text).toContain("Set the form action = submit and the href=home value, then src=x.");
    expect(text).toContain("An inline definition toggle.");
    expect(prepared).not.toContain("<form");
    expect(prepared).not.toContain("<button");
    expect(prepared).not.toContain("https://bad.example");
  });
});
