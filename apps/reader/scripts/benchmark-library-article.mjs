// Optional second server runs the same fixture on the baseline revision.
import { createHash } from "node:crypto";

import { chromium, expect } from "@playwright/test";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5311";
const pairs = Number(process.env.READER_BENCH_PAIRS ?? 9);
const origins = [process.env.READER_BASELINE_ORIGIN, origin].filter(Boolean);
if (!Number.isInteger(pairs) || pairs < 1) {
  throw new Error("READER_BENCH_PAIRS must be a positive integer.");
}
for (const url of origins) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(url)) {
    throw new Error("Performance measurements require a loopback origin.");
  }
}
const article = `<!doctype html><title>Long article</title><article><h1>Study 00000</h1>${Array.from(
  { length: 3000 },
  (_, index) =>
    `${index % 10 === 0 ? `<h2>Section ${index / 10}</h2>` : ""}<p id="p${index}">Passage [${index}]. ${"Attention and retention. ".repeat(6)}</p>`,
).join("")}</article>`;
const target = {
  fileId: "article",
  file: "[[article.html]]",
  revision: `sha256:${createHash("sha256").update(article).digest("hex")}`,
  mediaType: "text/html",
  role: "primary",
};
const highlights = Array.from({ length: 600 }, (_, index) => ({
  collectionId: "benchmark",
  sourceId: "source-0",
  id: `highlight-${index}`,
  body: `> Passage [${index * 5}]

Reader highlight comment.`,
  annotationType: "highlight",
  tags: [],
  createdAt: "2026-01-01T00:00:00Z",
  recordRevision: "rev-1",
  document: target,
  target: { quote: { exact: `Passage [${index * 5}]` } },
}));
const articles = Array.from({ length: 10_000 }, (_, index) => ({
  collectionId: "benchmark",
  id: `source-${index}`,
  path: `sources/${index}.md`,
  title: `Study ${String((index * 7777) % 10_000).padStart(5, "0")}`,
  creators: [`Author ${index % 673}`],
  tags: [`tag-${index % 100}`, index % 2 ? "reading" : "research"],
  published: String(1900 + (index % 125)),
  readingStatus: ["inbox", "reading", "finished"][index % 3],
  documents: index === 0 ? [target] : [],
  properties: { tags: [`tag-${index % 100}`, index % 2 ? "reading" : "research"] },
  frontmatter: {},
  body: "",
  recordRevision: "rev-1",
}));
const browser = await chromium.launch();

function summary(times) {
  const sorted = times.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: Number(((sorted[middle] + sorted[Math.ceil(sorted.length / 2) - 1]) / 2).toFixed(3)),
    p95: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)),
    samples: times.map((time) => Number(time.toFixed(3))),
  };
}

try {
  const reports = {};
  for (const count of [100, 10_000]) {
    const sources = articles.slice(0, count);
    const lanes = [];
    for (const url of origins) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const errors = [];
      await context.route(
        (request) => request.origin !== url,
        (route) => route.abort(),
      );
      // Keep component timings independent of deferred React work following the first grid commit.
      const fixture = await context.newPage();
      fixture.on("pageerror", (error) => errors.push(error.message));
      await fixture.goto(`${url}/test-fixtures/import-proof.html`);
      const sidebarPage = await context.newPage();
      sidebarPage.on("pageerror", (error) => errors.push(error.message));
      lanes.push({ url, context, fixture, sidebarPage, errors, times: {} });
    }
    for (let pair = 0; pair <= pairs; pair++) {
      for (const { url, fixture, sidebarPage, errors, times } of pair % 2
        ? lanes.toReversed()
        : lanes) {
        console.error(`Benchmarking ${count} sources, pair ${pair || "warm-up"}, ${url}`);
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        try {
          await context.route(
            (request) => request.origin !== url,
            (route) => route.abort(),
          );
          const page = await context.newPage();
          page.on("pageerror", (error) => errors.push(error.message));
          await page.route(`${url}/__reader-audit/**`, (route) => {
            const path = new URL(route.request().url()).pathname.slice("/__reader-audit/".length);
            if (path === "library") return route.fulfill({ json: sources });
            if (path === "source/source-0") return route.fulfill({ json: sources[0] });
            if (path === "document/article")
              return route.fulfill({ body: article, contentType: "text/html" });
            if (path === "annotations/source-0") return route.fulfill({ json: highlights });
            return route.fulfill({ json: [] });
          });
          await page.addInitScript((count) => {
            performance.setResourceTimingBufferSize(5000);
            globalThis.readerGridReady = new Promise((resolve, reject) => {
              const observer = new globalThis.MutationObserver(() => {
                if (
                  globalThis.document.querySelector(`.library-table[aria-rowcount="${count + 1}"]`)
                ) {
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
          await page.goto(`${url}/test-fixtures/audit-reader.html`, {
            waitUntil: "domcontentloaded",
          });
          await expect(page.locator(".library-table:visible")).toHaveAttribute(
            "aria-rowcount",
            String(count + 1),
            { timeout: 60_000 },
          );
          const grid = await page.evaluate(() => globalThis.readerGridReady);
          expect(
            await page.locator(".library-table:visible [data-row-index]").count(),
          ).toBeLessThan(60);
          const scroll = await page
            .locator(".library-table:visible")
            .evaluate(async (table, count) => {
              const viewport = table.closest(".library-table-frame");
              const index = Math.floor(count * 0.7);
              const start = performance.now();
              viewport.scrollTop = index * 48;
              while (!table.querySelector(`[data-row-index="${index}"]`)) {
                if (performance.now() - start > 5000)
                  throw new Error("Grid did not mount target row");
                await new Promise((done) => globalThis.requestAnimationFrame(done));
              }
              const jump = performance.now() - start;
              // Advance by a few rows each frame so successive windows overlap, as
              // they do during a wheel scroll. Include the cost of mounting new rows.
              const frame = () => new Promise((done) => globalThis.requestAnimationFrame(done));
              const intervals = [];
              viewport.scrollTop = 0;
              let previous = await frame();
              for (let step = 0; step < 24; step++) {
                viewport.scrollTop += 3 * 48;
                const now = await frame();
                intervals.push(now - previous);
                previous = now;
              }
              viewport.scrollTop = 0;
              intervals.sort((a, b) => a - b);
              return {
                "virtualized scroll to target row": jump,
                "scroll frame interval p95": intervals[Math.ceil(intervals.length * 0.95) - 1],
              };
            }, count);
          const open = await page
            .locator('.library-table:visible a[href="#source=source-0"]')
            .evaluate((link) => {
              const start = performance.now();
              link.click();
              return new Promise((resolve, reject) => {
                let usable;
                function wait() {
                  const frame = globalThis.document.querySelector("iframe.html-viewer");
                  const paragraph = frame?.contentDocument?.getElementById("p2999");
                  if (paragraph?.getBoundingClientRect().height) {
                    usable ??= performance.now() - start;
                    if (
                      !frame
                        .closest(".document-renderer-stage")
                        ?.querySelector(".document-renderer-status")
                    ) {
                      resolve({
                        "open article to first usable iframe": usable,
                        "open article until readable": performance.now() - start,
                      });
                      return;
                    }
                  }
                  if (performance.now() - start > 15000)
                    reject(new Error("Article did not render"));
                  else globalThis.requestAnimationFrame(wait);
                }
                wait();
              });
            });
          await page.close();
          await sidebarPage.goto(
            `${url}/test-fixtures/annotation-scale.html?count=600&format=html`,
            {
              waitUntil: "domcontentloaded",
            },
          );
          const annotationPanel = sidebarPage.getByRole("button", { name: "Mount annotations" });
          const sidebar = await annotationPanel.evaluate((tab) => {
            const start = performance.now();
            tab.click();
            return new Promise((resolve, reject) => {
              function wait() {
                const cards = [
                  ...globalThis.document.querySelectorAll('[data-item-id][aria-setsize="600"]'),
                ].filter(
                  (item) =>
                    item.getBoundingClientRect().height > 0 && !item.closest("[hidden], [inert]"),
                );
                if (cards.length > 0 && cards.length < 30) resolve(performance.now() - start);
                else if (performance.now() - start > 10000)
                  reject(new Error("Annotation sidebar did not render a bounded window"));
                else globalThis.requestAnimationFrame(wait);
              }
              wait();
            });
          });
          const runs = await fixture.evaluate(
            async ({ sources, moduleUrl }) =>
              (await import(moduleUrl)).measureLibraryAndArticle(sources),
            { sources, moduleUrl: "/test-fixtures/library-article-benchmark.tsx" },
          );
          expect(errors).toEqual([]);
          if (pair > 0) {
            for (const [label, ms] of Object.entries({
              ...grid,
              ...scroll,
              ...open,
              "open annotation sidebar (600 highlights)": sidebar,
              ...runs,
            })) {
              (times[label] ??= []).push(ms);
            }
          }
        } finally {
          await context.close();
        }
      }
    }
    for (const { url, context, times } of lanes) {
      reports[`${count} @ ${url}`] = Object.fromEntries(
        Object.entries(times).map(([k, v]) => [k, summary(v)]),
      );
      await context.close();
    }
  }
  console.log(JSON.stringify({ chromium: browser.version(), milliseconds: reports }, null, 2));
} finally {
  await browser.close();
}
