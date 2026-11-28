import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

import { auditEpub } from "./reader-audit-documents.mjs";

const root = resolve(import.meta.dirname, "..");
const article =
  "<title>Study title</title><article><h1>Study title</h1><h2>Abstract</h2><h3>Methods</h3>" +
  Array.from(
    { length: 1000 },
    (_, i) =>
      `<p>Passage [${i}] about reading, retention and attention. The study compares two methods.</p>`,
  ).join("") +
  "</article>";
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let size = 2000;
  const sources = Array.from({ length: 10000 }, (_, i) => ({
    collectionId: "audit",
    id: `s${i}`,
    path: `sources/${i}.md`,
    title: `Study ${String(i).padStart(5, "0")}`,
    creators: ["Author"],
    tags: ["research"],
    documents: i
      ? []
      : [
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
  }));
  const annotations = [];
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  await page.route(origin + "/__reader-audit/**", (route) => {
    const path = new URL(route.request().url()).pathname.slice("/__reader-audit/".length);
    if (path === "library") return route.fulfill({ json: sources.slice(0, size) });
    if (path.startsWith("source/s")) {
      const source = sources[Number(path.slice("source/s".length))];
      if (source?.id === path.slice("source/".length)) return route.fulfill({ json: source });
    }
    if (path === "document/article")
      return route.fulfill({ body: article, contentType: "text/html" });
    if (path === "annotations/s0" && route.request().method() === "PUT") {
      const { request } = route.request().postDataJSON();
      const record = {
        ...request,
        id: `a${annotations.length}`,
        createdAt: "2026-01-01T00:00:00Z",
        recordRevision: "rev-1",
      };
      annotations.push(record);
      return route.fulfill({ json: record });
    }
    if (path.startsWith("annotations/")) {
      const owner = path.slice("annotations/".length);
      return route.fulfill({
        json: owner === "*" ? annotations : annotations.filter((note) => note.sourceId === owner),
      });
    }
    if (path === "search") return route.fulfill({ json: [] });
    return route.fulfill({ status: 404 });
  });
  const grid = page.locator(".library-table:visible");
  for (const count of [2000, 10000]) {
    size = count;
    await page.goto(origin + "/test-fixtures/audit-reader.html");
    await expect(grid).toHaveAttribute("aria-rowcount", String(size + 1), { timeout: 60000 });
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const rows = grid.locator("[data-row-index]");
      await rows.first().focus();
      await page.keyboard.press("End");
      await expect(grid.locator(`[aria-rowindex="${size + 1}"]`)).toBeFocused();
      expect(await rows.count()).toBeLessThan(60);
      await page.keyboard.press("Home");
      await expect(grid.locator('[aria-rowindex="2"]')).toBeFocused();
      const overflow = await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      console.log("Library", size, width, "mounted rows", await rows.count());
    }
  }
  const scrollMedian = await grid.evaluate(async (el) => {
    const frame = el.closest(".library-table-frame");
    const times = [];
    for (let i = 0; i < 8; i++) {
      const index = (i + 1) * 900;
      const start = performance.now();
      frame.scrollTop = index * 48;
      while (!el.querySelector(`[data-row-index="${index}"]`)) {
        if (performance.now() - start > 5000)
          throw new Error("Virtual scroll did not render target row");
        await new Promise((done) => globalThis.requestAnimationFrame(done));
      }
      if (i) times.push(performance.now() - start);
    }
    frame.scrollTop = 0;
    return times.sort((a, b) => a - b)[3];
  });
  console.log("10k grid scroll to mounted row, ms", scrollMedian);
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve("axe-core/axe.min.js") });
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const issues = await page.evaluate(async () =>
      (await globalThis.axe.run(globalThis.document)).violations.map(({ id }) => id),
    );
    expect(issues).toEqual([]);
    console.log("Library axe", width, issues);
  }
  const firstRow = grid.locator('[aria-rowindex="2"]');
  await firstRow.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(firstRow).toBeFocused();
  await firstRow.press("Enter");
  const frame = page.frameLocator("iframe.html-viewer:visible");
  const tags = ["h1", "h2", "h3", "p"];
  const names = ["Study title", "Abstract", "Methods", "Passage [0]"];
  const registered = () =>
    frame.locator("body").evaluate((body) => {
      const win = body.ownerDocument.defaultView;
      return [...win.CSS.highlights]
        .filter(([name]) => name.startsWith("reader-annotation-"))
        .flatMap(([name, ranges]) =>
          [...ranges].filter(
            (range) =>
              range.getBoundingClientRect().height > 0 &&
              win.getComputedStyle(range.startContainer.parentElement, `::highlight(${name})`)
                .backgroundColor !== "rgba(0, 0, 0, 0)",
          ),
        )
        .map((range) => [range.startContainer.parentElement.localName, range.toString()])
        .sort();
    });
  for (const [i, tag] of tags.entries()) {
    await frame
      .locator(tag)
      .first()
      .evaluate((el, length) => {
        const doc = el.ownerDocument;
        const range = doc.createRange();
        range.setStart(el.firstChild, 0);
        range.setEnd(el.firstChild, length);
        const selection = doc.defaultView.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        doc.dispatchEvent(new doc.defaultView.PointerEvent("pointerup", { bubbles: true }));
      }, names[i].length);
    await page
      .getByRole("toolbar", { name: "Selected text" })
      .getByRole("group", { name: "Highlight in a colour" })
      .getByRole("button")
      .first()
      .click();
    await expect.poll(registered).toHaveLength(i + 1);
  }
  await page.reload();
  await expect.poll(registered).toEqual(tags.map((tag, i) => [tag, names[i]]).sort());
  console.log("Restored four saved in-document ranges", await registered());
  const epub = [...(await auditEpub())];
  const metrics = await page.evaluate(
    async ({ root, article, epub }) => {
      const { readDocumentFileDetails } = await import(`/@fs${root}/src/document-details.ts`);
      const html = new TextEncoder().encode(article);
      const book = new Uint8Array(epub);
      const { HtmlDocumentRuntime } = await import(
        `/@fs${root}/../../packages/renderer-html/src/html-runtime.ts`
      );
      const { prepareHtmlDocument } = await import(
        `/@fs${root}/../../packages/renderer-html/src/html-document.ts`
      );
      const frame = globalThis.document.createElement("iframe");
      frame.sandbox = "allow-same-origin";
      frame.title = "Long article benchmark";
      globalThis.document.body.append(frame);
      const samples = {};
      async function median(name, operation) {
        await operation();
        const times = [];
        for (let sample = 0; sample < 7; sample++) {
          const start = performance.now();
          await operation();
          times.push(performance.now() - start);
        }
        samples[name] = Number(times.sort((a, b) => a - b)[3].toFixed(2));
      }
      for (const [name, bytes, title] of [
        ["article.html", html, "Study title"],
        ["book.epub", book, "[test] EPUB reading fixture"],
      ]) {
        await median(name, async () => {
          if ((await readDocumentFileDetails({ name, bytes })).title !== title)
            throw new Error("Wrong import title");
        });
      }
      await median("prepare article, load iframe and layout", async () => {
        const loaded = new Promise((done) => frame.addEventListener("load", done, { once: true }));
        frame.srcdoc = prepareHtmlDocument(article);
        await loaded;
        if (
          !(frame.contentDocument.querySelector("p:last-child")?.getBoundingClientRect().bottom > 0)
        )
          throw new Error("Article not laid out");
      });
      // A fresh runtime per sample excludes previously located ranges but includes marker layout.
      for (const count of [50, 200]) {
        const records = Array.from({ length: count }, (_, i) => ({
          id: `b${i}`,
          body: "",
          target: { quote: { exact: `Passage [${i * 5}]` } },
        }));
        await median(`anchor and lay out ${count}`, () => {
          const runtime = new HtmlDocumentRuntime(frame, "article.html");
          try {
            runtime.setAnnotations(records);
            if (frame.contentWindow.CSS.highlights.get("reader-annotation-yellow")?.size !== count)
              throw new Error("Ranges missing");
          } finally {
            runtime.destroy();
          }
        });
      }
      frame.remove();
      return samples;
    },
    { root, article, epub },
  );
  expect(errors).toEqual([]);
  console.log(browser.version(), metrics);
} finally {
  await browser?.close();
  await server.close();
}
