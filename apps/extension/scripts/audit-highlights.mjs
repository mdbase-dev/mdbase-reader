/* global document, CSS, Highlight -- evaluated inside the isolated Chromium fixture */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(new URL("../../reader/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const ts = createRequire(new URL("../../../package.json", import.meta.url))("typescript");
const endpoint = process.env.MDBASE_BROWSER_CDP_URL;
if (!endpoint?.startsWith("http://127.0.0.1:")) throw new Error("Use the owned LAB browser lease.");
const browser = await chromium.connectOverCDP(endpoint);
const page = await browser.contexts()[0].newPage();
const source = await readFile(new URL("../src/page-annotations.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const cases = [
  ["single", "<p>Alpha beta gamma delta epsilon zeta.</p>", [{ exact: "beta gamma" }], 1],
  [
    "cross-inline",
    "<p>Alpha beta <em>gamma delta</em> epsilon zeta.</p>",
    [{ exact: "beta gamma" }],
    1,
  ],
  [
    "same-text-node",
    "<p>Alpha beta gamma delta epsilon zeta.</p>",
    [{ exact: "beta" }, { exact: "epsilon" }],
    2,
  ],
  [
    "overlapping",
    "<p>Alpha beta gamma delta epsilon zeta.</p>",
    [{ exact: "beta gamma" }, { exact: "gamma delta" }],
    2,
  ],
  ["whitespace", "<p>Alpha beta\n gamma delta.</p>", [{ exact: "beta gamma" }], 1],
  ["ambiguous", "<p>Alpha beta gamma.</p><p>Alpha beta gamma.</p>", [{ exact: "beta" }], 0],
  [
    "context",
    "<p>Alpha beta gamma.</p><p>Delta beta epsilon.</p>",
    [{ exact: "beta", prefix: "Delta " }],
    1,
  ],
];
const results = [];
try {
  await page.setViewportSize({ width: 850, height: 600 });
  for (const [name, html, quotes, expected] of cases) {
    await page.setContent(html);
    const result = await page.evaluate(
      ({ js, quotes }) => {
        const exports = {};
        new Function("exports", js)(exports);
        // Re-serialize the actual injection entry point, as Chrome scripting does.
        const project = new Function(`return (${exports.pageAnnotations.toString()})`)();
        const before = document.body.innerHTML;
        CSS.highlights.set("other-app", new Highlight());
        project({ action: "render", quotes });
        const report = project({ action: "render", quotes }).report;
        return {
          report,
          unchanged: document.body.innerHTML === before,
          externalPreserved: CSS.highlights.has("other-app"),
          highlights: [...CSS.highlights]
            .filter(([key]) => key.startsWith("mdbase-reader-"))
            .map(([, highlight]) => [...highlight].map((range) => range.toString())),
        };
      },
      { js, quotes },
    );
    assert.equal(result.report.shown, expected, name);
    assert.equal(result.highlights.length, expected, `${name}: duplicate render`);
    assert.equal(result.unchanged, true, `${name}: page content mutated`);
    assert.equal(result.externalPreserved, true, `${name}: another app's highlights removed`);
    results.push({ name, ...result });
  }
  console.log(JSON.stringify({ result: "passed", cases: results }, null, 2));
} catch (error) {
  const directory = process.env.MDBASE_BROWSER_SCREENSHOT_DIR;
  if (directory)
    await page.screenshot({ path: path.join(directory, "extension-highlight-failure.png") });
  console.error(String(error));
  process.exitCode = 1;
} finally {
  await page.close();
  // Disconnect only. Never close the shared LAB browser from an audit.
  process.exit(process.exitCode ?? 0);
}
