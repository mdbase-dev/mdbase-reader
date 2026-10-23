import { writeFile } from "node:fs/promises";

import { chromium, expect } from "@playwright/test";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5193";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) throw new Error("Loopback fixture only");
const browser = await chromium.launch({ headless: true });
const samples = [];
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
try {
  for (const count of [300, 1000, 3000]) {
    for (let run = 0; run < 5; run++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${origin}/test-fixtures/annotation-scale.html?count=${count}`);
      await expect(page.getByRole("button", { name: "Mount annotations" })).toBeVisible();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("HeapProfiler.collectGarbage");
      const before = (await cdp.send("Runtime.getHeapUsage")).usedSize;
      // In-page events avoid Playwright transport/actionability time. Two rAFs include a paint
      // opportunity, but are frame-quantized, not field INP or a CPU-only render measurement.
      const measure = async (selector, action, value) => page.evaluate(async ({ selector, action, value }) => {
        const element = document.querySelector(selector);
        const start = performance.now();
        if (action === "click") element.click();
        if (action === "scroll") element.scrollTop = value;
        if (action === "type") {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - start;
      }, { selector, action, value });
      const mountMs = await measure("main > button", "click");
      await expect(page.getByRole("listitem").first()).toBeVisible();
      const renderMs = await page.evaluate(() => window.scaleMetrics.renderMs.reduce((a, b) => a + b, 0));
      await cdp.send("HeapProfiler.collectGarbage");
      const heapMiB = (await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576;
      const heapDeltaMiB = heapMiB - before / 1048576;
      const mountedCards = await page.locator("[data-annotation-id]").count();
      const typing = [];
      for (const text of ["P", "Pa", "Pas", "Pass", "Passa", "Passage"]) {
        typing.push(await measure('[aria-label="Search annotations"]', "type", text));
      }
      await measure('[aria-label="Search annotations"]', "type", "");
      const scrolling = [];
      for (const offset of [1000, 6000, 30000, 10000, 0]) scrolling.push(await measure(".annotation-list", "scroll", offset));
      const selectMs = await measure("main > button:nth-of-type(2)", "click");
      await expect(page.locator(`[data-annotation-id="scale_${String(count - 1).padStart(4, "0")}"]`)).toBeVisible();
      expect(errors).toEqual([]);
      samples.push({ count, run, mountMs, renderMs, typingMs: median(typing), scrollMs: median(scrolling), selectMs, heapMiB, heapDeltaMiB, mountedCards });
      if (process.env.READER_SCALE_SCREENSHOT && count === 3000 && run === 4) await page.screenshot({ path: process.env.READER_SCALE_SCREENSHOT });
      await page.close();
    }
  }
  const summary = [300, 1000, 3000].map((count) => Object.fromEntries([
    ["count", count],
    ...Object.keys(samples[0]).filter((key) => !["count", "run"].includes(key)).map((key) => [key, Number(median(samples.filter((sample) => sample.count === count).map((sample) => sample[key])).toFixed(2))]),
  ]));
  const result = { chromium: browser.version(), summary, samples };
  console.log(JSON.stringify(result, null, 2));
  if (process.argv[2]) await writeFile(process.argv[2], `${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
