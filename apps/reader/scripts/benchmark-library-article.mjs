// Run locally with a warmed Vite server. Each row has one warm-up and nine samples.
import { chromium, expect } from "@playwright/test";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5311";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Performance measurements require a loopback origin.");
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

function summary(times) {
  const sorted = times.toSorted((a, b) => a - b);
  return {
    median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
    p95: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)),
    samples: times.map((time) => Number(time.toFixed(2))),
  };
}

try {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  await page.route(`${origin}/__reader-audit/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith("/library") ? articles : [] });
  });
  await page.addInitScript(() => {
    globalThis.readerGridReady = new Promise((resolve) => {
      const observer = new globalThis.MutationObserver(() => {
        if (globalThis.document.querySelector('.library-table[aria-rowcount="10001"]')) {
          observer.disconnect();
          resolve(performance.now());
        }
      });
      observer.observe(globalThis.document, { attributes: true, childList: true, subtree: true });
    });
  });
  const startup = [];
  const grid = page.locator(".library-table:visible");
  for (let i = 0; i < 10; i++) {
    await page.goto(`${origin}/test-fixtures/audit-reader.html`, { waitUntil: "domcontentloaded" });
    const elapsed = await page.evaluate(() => globalThis.readerGridReady);
    if (i) startup.push(elapsed);
  }
  await expect(grid).toHaveAttribute("aria-rowcount", "10001");
  expect(await grid.locator("[data-row-index]").count()).toBeLessThan(60);
  const runs = await page.evaluate(
    async ({ sources, moduleUrl }) => {
      const { measureLibraryAndArticle } = await import(moduleUrl);
      return measureLibraryAndArticle(sources);
    },
    { sources: articles, moduleUrl: "/test-fixtures/library-article-benchmark.tsx" },
  );
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify(
      {
        chromium: browser.version(),
        milliseconds: Object.fromEntries(
          [["startup to virtualized 10k grid", startup], ...Object.entries(runs)].map(
            ([label, times]) => [label, summary(times)],
          ),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
