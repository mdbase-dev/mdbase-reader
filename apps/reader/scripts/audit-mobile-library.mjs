import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
const article = `<!doctype html><html lang="en"><head><title>Attention and memory</title></head><body><main><h1>Attention and memory</h1><h2>Methods</h2>${"<p>The authors compared two reading methods.</p>".repeat(1200)}</main></body></html>`;
const collection = [
  {
    collectionId: "audit",
    id: "attention",
    path: "sources/attention.md",
    title: "Attention and memory",
    creators: ["Ada"],
    tags: ["research"],
    documents: [
      {
        fileId: "article",
        file: "[[article.html]]",
        revision: `sha256:${createHash("sha256").update(article).digest("hex")}`,
        mediaType: "text/html",
        role: "primary",
      },
    ],
    frontmatter: {},
    body: "",
    recordRevision: "rev-1",
  },
  {
    collectionId: "audit",
    id: "structural",
    path: "sources/structural.md",
    title: "Structural learning",
    creators: ["Inez"],
    tags: ["learning"],
    documents: [],
    frontmatter: {},
    body: "",
    recordRevision: "rev-2",
  },
];

let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 360, height: 740 },
      isMobile: true,
      hasTouch: true,
      colorScheme,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    await page.route(origin + "/__reader-audit/**", (route) => {
      const path = new URL(route.request().url()).pathname.slice("/__reader-audit/".length);
      if (path === "library") return route.fulfill({ json: collection });
      if (path === "document/article")
        return route.fulfill({ body: article, contentType: "text/html" });
      if (path.startsWith("source/")) {
        const source = collection.find(({ id }) => id === path.slice("source/".length));
        if (source) return route.fulfill({ json: source });
      }
      if (path === "search" || path.startsWith("annotations/")) return route.fulfill({ json: [] });
      return route.fulfill({ status: 404 });
    });
    const fixtureUrl = origin + "/test-fixtures/audit-reader.html?unrelated=keep";
    await page.goto(fixtureUrl);
    const grid = page.getByRole("treegrid", { name: "Sources" });
    const search = page.getByRole("textbox", { name: "Search this view" });
    await expect(grid).toHaveAttribute("aria-rowcount", "3", { timeout: 60000 });
    await assertAxe(page, `${colorScheme} library`);
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await search.fill("attention");
    await expect(grid).toHaveAttribute("aria-rowcount", "2");
    const filter = page.locator(".library-workspace-more > summary:visible");
    await filter.tap();
    const options = page.locator(".reader-menu-panel:visible").filter({ hasText: "Clear filters" });
    const tag = page.getByRole("textbox", { name: "Tag", exact: true });
    await tag.fill("research");
    await expect(grid).toHaveAttribute("aria-rowcount", "2");
    const bounds = await options.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
    await assertAxe(page, `${colorScheme} open filters`);
    await page.keyboard.press("Escape");
    await expect(filter).toBeFocused();
    await expect.poll(() => new URL(page.url()).hash).toContain("reader-filter=");
    expect(new URL(page.url()).searchParams.get("unrelated")).toBe("keep");
    const filteredUrl = page.url();
    await page.reload();
    await expect(search).toHaveValue("attention");
    await filter.tap();
    await expect(tag).toHaveValue("research");
    await page.keyboard.press("Escape");
    await page.keyboard.press("/");
    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(grid).toHaveAttribute("aria-rowcount", "2");
    await search.press("ArrowDown");
    const row = grid.getByRole("row", { name: /^Attention and memory/u });
    await expect(row).toBeFocused();
    await page.evaluate((hash) => {
      globalThis.location.hash = hash;
    }, new URL(filteredUrl).hash);
    await expect(search).toHaveValue("attention");
    await page.evaluate(() => {
      globalThis.location.hash = "";
    });
    await expect(grid).toHaveAttribute("aria-rowcount", "3");
    await page.goBack();
    await expect(search).toHaveValue("attention");
    await row.getByRole("link").tap();
    const frame = page.locator("iframe.html-viewer:visible");
    await expect(frame).toBeVisible();
    await expect(
      frame.contentFrame().getByRole("heading", { name: "Attention and memory" }),
    ).toBeVisible();
    const document = frame.contentFrame().locator("html");
    await expect(document).toHaveAttribute("data-reader-scheme", colorScheme);
    await frame.contentFrame().locator("h1").tap();
    await page.keyboard.press("PageDown");
    await expect.poll(() => document.evaluate((root) => root.scrollTop)).toBeGreaterThan(0);
    const sourceViews = page.getByRole("navigation", { name: "Source views" });
    await expect(sourceViews).toBeVisible();
    for (const button of await sourceViews.getByRole("button").all()) {
      const bounds = await button.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(() => ({
        viewport: globalThis.innerWidth,
        document: globalThis.document.documentElement.scrollWidth,
        dark: globalThis.matchMedia("(prefers-color-scheme: dark)").matches,
      })),
    ).toEqual({ viewport: 360, document: 360, dark: colorScheme === "dark" });
    await assertAxe(page, `${colorScheme} article`);
    await context.close();
  }
  console.log(
    "360px touch Chromium: filters, URL restoration, keyboard and article controls passed in light and dark",
  );
} finally {
  await browser?.close();
  await server.close();
}

async function assertAxe(page, label) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const results = await globalThis.axe.run(globalThis.document, { resultTypes: ["violations"] });
    return results.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    }));
  });
  expect(violations, label).toEqual([]);
}
