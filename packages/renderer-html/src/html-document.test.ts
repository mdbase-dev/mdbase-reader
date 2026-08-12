// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { prepareHtmlDocument } from "./html-document.js";

describe("prepareHtmlDocument", () => {
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
});
