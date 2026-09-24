import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { chromium } from "@playwright/test";
import * as ts from "typescript";

// Isolated browser regression: no Connect daemon or user collection required.
const source = await readFile(new URL("../src/annotation-card-scroll.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1260, height: 500 },
    reducedMotion: "reduce",
  });
  await page.setContent(`
    <style>
      body { margin: 0; }
      main { position: relative; height: 450px; overflow: hidden; }
      .annotation-list { height: 450px; width: 400px; overflow: auto; }
      .spacer { height: 1000px; }
      .annotation-card { height: 100px; }
      .hidden-tab { position: absolute; top: 0; left: 400px; visibility: hidden; }
      .hidden-tab .annotation-list { height: 700px; }
      .retained-overlay { position: absolute; top: 450px; height: 450px; width: 1px; visibility: hidden; }
    </style>
    <main>
      <div class="annotation-list"><div class="spacer"></div><div class="annotation-card" id="visible">Visible card</div></div>
      <div class="hidden-tab" aria-hidden="true"><div class="annotation-list"><div class="spacer"></div><div class="annotation-card" id="hidden">Hidden duplicate</div></div></div>
      <div class="retained-overlay"></div>
    </main>
  `);
  await page.addScriptTag({
    content: `const exports = {};\n${compiled}\nwindow.scrollAnnotationCard = exports.scrollAnnotationCard;`,
  });
  /* global document, window -- evaluated in the isolated browser page below */
  const result = await page.evaluate(() => {
    const main = document.querySelector("main");
    const visible = document.querySelector("#visible");
    const hidden = document.querySelector("#hidden");
    // First prove the fixture reproduces the original browser behaviour.
    hidden.scrollIntoView({ block: "nearest", behavior: "instant" });
    const originalOuterScroll = main.scrollTop;
    main.scrollTop = 0;
    hidden.parentElement.scrollTop = 0;
    window.scrollAnnotationCard(hidden);
    const hiddenListScroll = hidden.parentElement.scrollTop;
    window.scrollAnnotationCard(visible);
    return {
      originalOuterScroll,
      fixedOuterScroll: main.scrollTop,
      hiddenListScroll,
      visibleListScroll: visible.parentElement.scrollTop,
      visibleBottom: visible.getBoundingClientRect().bottom,
    };
  });
  assert.equal(
    result.originalOuterScroll,
    250,
    "fixture must reproduce the bottom-half blank space",
  );
  assert.equal(result.fixedOuterScroll, 0, "the workspace must not scroll");
  assert.equal(result.hiddenListScroll, 0, "the hidden duplicate must not scroll");
  assert.equal(result.visibleListScroll, 650, "the visible Notes list must still reveal the card");
  assert.equal(result.visibleBottom, 450);
  console.log("Annotation scroll browser regression passed:", result);
} finally {
  await browser.close();
}
