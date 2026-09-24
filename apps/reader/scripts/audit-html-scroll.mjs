import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { chromium } from "@playwright/test";
import * as ts from "typescript";

// Isolated HTML iframe regression; no Connect daemon or user collection required.
const source = await readFile(
  new URL("../../../packages/renderer-html/src/html-scroll.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 550 } });
  await page.setContent(`
    <style>
      body { margin: 0; }
      main { position: relative; height: 500px; overflow: hidden; }
      header { height: 36px; }
      iframe { display: block; width: 100%; height: 464px; border: 0; }
      .retained-overlay { position: absolute; top: 500px; height: 500px; width: 1px; visibility: hidden; }
    </style>
    <main><header>Reader tabs</header><iframe sandbox="allow-same-origin"></iframe><div class="retained-overlay"></div></main>
  `);
  /* global document, window -- evaluated in the isolated browser page below */
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const frame = document.querySelector("iframe");
        frame.addEventListener("load", resolve, { once: true });
        frame.srcdoc = `<!doctype html><style>
      html { scroll-behavior: smooth; }
      body { margin: 0; }
      .spacer { height: 4000px; }
      h2, p { margin: 0; height: 40px; }
    </style><div class="spacer"></div><h2>Target section</h2><div class="spacer"></div><p>Annotated passage</p><div class="spacer"></div>`;
      }),
  );
  await page.addScriptTag({
    content: `const exports = {};\n${compiled}\nwindow.scrollHtmlElement = exports.scrollHtmlElement;`,
  });
  const original = await page.evaluate(() => {
    const view = document.querySelector("iframe").contentWindow;
    view.document.querySelector("h2").scrollIntoView({ block: "start" });
    view.scrollBy(0, -24);
    return document.querySelector("main").scrollTop;
  });
  assert.equal(original, 36, "original navigation must reproduce the shifted workspace");
  await page.waitForTimeout(1200);
  assert.equal(
    await page.evaluate(() => document.querySelector("iframe").contentWindow.scrollY),
    0,
    "the second scroll cancels the original contents jump",
  );

  for (const reducedMotion of ["no-preference", "reduce"]) {
    await page.emulateMedia({ reducedMotion });
    for (const alignment of ["start", "center"]) {
      await page.evaluate((alignment) => {
        const view = document.querySelector("iframe").contentWindow;
        document.querySelector("main").scrollTop = 0;
        view.scrollTo({ top: 1000, behavior: "instant" });
        const target = view.document.querySelector(alignment === "start" ? "h2" : "p");
        window.scrollHtmlElement(view, target, alignment);
      }, alignment);
      await page.waitForFunction((alignment) => {
        const view = document.querySelector("iframe").contentWindow;
        const target = view.document.querySelector(alignment === "start" ? "h2" : "p");
        const bounds = target.getBoundingClientRect();
        const expected = alignment === "start" ? 24 : (view.innerHeight - bounds.height) / 2;
        return Math.abs(bounds.top - expected) < 1;
      }, alignment);
      assert.equal(
        await page.evaluate(() => document.querySelector("main").scrollTop),
        0,
        `${alignment} navigation (${reducedMotion}) must not scroll the workspace`,
      );
    }
  }
  console.log(
    "HTML navigation browser regression passed: contents and annotations stay frame-local, with correct destinations.",
  );
} finally {
  await browser.close();
}
