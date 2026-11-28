// Optional second server runs the same fixture on the baseline revision.
import { chromium, expect } from "@playwright/test";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5311";
const origins = [process.env.READER_BASELINE_ORIGIN, origin].filter(Boolean);
for (const url of origins) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(url)) {
    throw new Error("Performance measurements require a loopback origin.");
  }
}
const articles = Array.from({ length: 10_000 }, (_, index) => ({
  collectionId: "benchmark",
  id: `source-${index}`,
  path: `sources/${index}.md`,
  title: `Study ${String((index * 7777) % 10_000).padStart(5, "0")}`,
  creators: [`Author ${index % 673}`],
  tags: [`tag-${index % 100}`, index % 2 ? "reading" : "research"],
  published: String(1900 + (index % 125)),
  documents: [],
  properties: { tags: [`tag-${index % 100}`, index % 2 ? "reading" : "research"] },
  frontmatter: {},
  body: "",
  recordRevision: "rev-1",
}));
const browser = await chromium.launch();

function summary(times) {
  const sorted = times.toSorted((a, b) => a - b);
  return {
    median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
    p95: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)),
    samples: times.map((time) => Number(time.toFixed(2))),
  };
}

try {
  const reports = {};
  for (const count of [100, 10_000]) {
    const sources = articles.slice(0, count);
    const lanes = [];
    for (const url of origins) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route(
        (request) => request.origin !== url,
        (route) => route.abort(),
      );
      await page.route(`${url}/__reader-audit/**`, (route) => {
        const library = new URL(route.request().url()).pathname.endsWith("/library");
        return route.fulfill({ json: library ? sources : [] });
      });
      await page.addInitScript((count) => {
        performance.setResourceTimingBufferSize(5000);
        globalThis.readerGridReady = new Promise((resolve, reject) => {
          const observer = new globalThis.MutationObserver(() => {
            if (globalThis.document.querySelector(`.library-table[aria-rowcount="${count + 1}"]`)) {
              observer.disconnect();
              const now = performance.now();
              const response = performance.getEntriesByName(
                new URL("/__reader-audit/library", globalThis.location.href).href,
              )[0];
              if (!response) {
                reject(new Error("Missing library response timing"));
                return;
              }
              resolve({
                "startup to virtualized grid": now,
                "library response to grid": now - response.responseEnd,
              });
            }
          });
          observer.observe(globalThis.document, {
            attributes: true,
            childList: true,
            subtree: true,
          });
        });
      }, count);
      // Keep component timings independent of deferred React work following the first grid commit.
      const fixture = await context.newPage();
      fixture.on("pageerror", (error) => errors.push(error.message));
      await fixture.goto(`${url}/test-fixtures/import-proof.html`);
      lanes.push({ url, page, fixture, errors, times: {} });
    }
    for (let pair = 0; pair < 10; pair++) {
      for (const { url, page, fixture, errors, times } of pair % 2 ? lanes.toReversed() : lanes) {
        await page.goto(`${url}/test-fixtures/audit-reader.html`, {
          waitUntil: "domcontentloaded",
        });
        await expect(page.locator(".library-table:visible")).toHaveAttribute(
          "aria-rowcount",
          String(count + 1),
          { timeout: 60_000 },
        );
        const grid = await page.evaluate(() => globalThis.readerGridReady);
        expect(await page.locator(".library-table:visible [data-row-index]").count()).toBeLessThan(
          60,
        );
        const runs = await fixture.evaluate(
          async ({ sources, moduleUrl }) =>
            (await import(moduleUrl)).measureLibraryAndArticle(sources),
          { sources, moduleUrl: "/test-fixtures/library-article-benchmark.tsx" },
        );
        expect(errors).toEqual([]);
        if (pair > 0) {
          for (const [label, ms] of Object.entries({
            ...grid,
            ...runs,
          })) {
            (times[label] ??= []).push(ms);
          }
        }
      }
    }
    for (const { url, page, times } of lanes) {
      reports[`${count} @ ${url}`] = Object.fromEntries(
        Object.entries(times).map(([k, v]) => [k, summary(v)]),
      );
      await page.context().close();
    }
  }
  console.log(JSON.stringify({ chromium: browser.version(), milliseconds: reports }, null, 2));
} finally {
  await browser.close();
}
