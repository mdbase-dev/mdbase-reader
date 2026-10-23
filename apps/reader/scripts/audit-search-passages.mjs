import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, expect } from "@playwright/test";

import { installLocalPdfium } from "./audit-local-pdfium.mjs";
import { chooseOption } from "./audit-select.mjs";
import { auditEpub, auditPdf } from "./reader-audit-documents.mjs";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5217";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Passage audits require an explicit loopback origin.");
}
const directory = await mkdtemp(join(tmpdir(), "reader-search-passages-"));
const files = [
  {
    kind: "html",
    mediaType: "text/html",
    bytes: Buffer.from(
      `<html><body><h1>Search fixture</h1>${Array.from({ length: 70 }, (_, index) => `<p>${index === 50 ? "Unique HTML passage" : "Ordinary reading text"} ${index}. Patient reading and careful attention.</p>`).join("")}</body></html>`,
    ),
    query: "Unique HTML passage",
  },
  { kind: "pdf", mediaType: "application/pdf", bytes: auditPdf(), query: "Page 6" },
  {
    kind: "epub",
    mediaType: "application/epub+zip",
    bytes: await auditEpub(),
    query: "test paragraph 24",
  },
  {
    kind: "html",
    mediaType: "text/html",
    bytes: Buffer.from(
      `<html><body>${"Ambiguous passage with exactly repeated surrounding evidence and extra context. ".repeat(20)}</body></html>`,
    ),
    query: "Ambiguous passage",
  },
];
const records = files.map((file, index) => ({
  collectionId: "test-reader-audit",
  id: `test_${index}`,
  path: `sources/test_${index}.md`,
  title: `[test] Passage ${index}`,
  creators: [],
  tags: [],
  body: "",
  recordRevision: "rev-1",
  frontmatter: {},
  documents: [
    {
      fileId: `file_${index}`,
      file: `[[files/${index}.${file.kind}]]`,
      revision: `sha256:${createHash("sha256").update(file.bytes).digest("hex")}`,
      mediaType: file.mediaType,
      role: "primary",
    },
  ],
}));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await installLocalPdfium(context);
await context.addInitScript(() =>
  localStorage.setItem(
    "mdbase-reader:shell:v1:test-reader-audit",
    JSON.stringify({ sidebarWhileReading: "keep" }),
  ),
);
const page = await context.newPage();
const errors = [];
const openedFiles = new Set();
const indexedFiles = new Set();
page.on("pageerror", (error) => errors.push(error.message));
await context.route(`${origin}/__reader-audit/**`, async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace("/__reader-audit/", "");
  const respond = (value) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
  if (path === "library") return respond(records);
  if (path.startsWith("annotations/")) {
    if (request.method() !== "GET") throw new Error("Search must not create an annotation");
    return respond([]);
  }
  if (path.startsWith("source/")) {
    const record = records.find(({ id }) => id === path.slice(7));
    if (record && request.method() === "PUT") Object.assign(record, request.postDataJSON());
    return respond(record ?? null);
  }
  if (path.startsWith("document/file_")) {
    const index = Number(path.slice("document/file_".length));
    (new URL(request.url()).searchParams.has("index") ? indexedFiles : openedFiles).add(index);
    const file = files[index];
    return route.fulfill({ contentType: file.mediaType, body: file.bytes });
  }
  if (path.startsWith("search")) return respond([]);
  return route.fulfill({ status: 404, body: "Unknown owned fixture route" });
});
const evidence = [];
try {
  await page.goto(`${origin}/test-fixtures/audit-reader.html`);
  for (const [index, file] of files.entries()) {
    const navigator = page.getByRole("textbox", { name: "Find a source by title, author or tag" });
    // HTML must be found through the persistent worker index before any surface opens.
    // PDF/EPUB still exercise loaded-document destinations.
    if (file.kind !== "html") {
      await navigator.fill(`Passage ${index}`);
      await page.getByRole("option", { name: new RegExp(`Passage ${index}`) }).dblclick();
      await expect(page.locator(`.document-session.is-active .${file.kind}-viewer`)).toBeVisible({
        timeout: 60_000,
      });
    }
    if (file.kind === "pdf") {
      await expect
        .poll(
          () =>
            page
              .locator(".document-session.is-active .pdf-viewer img")
              .evaluateAll((images) =>
                images.some((image) => image.complete && image.naturalWidth > 100),
              ),
          { timeout: 30_000 },
        )
        .toBe(true);
    }
    if (file.kind === "epub") {
      await expect(
        page
          .frameLocator(".document-session.is-active iframe.readium-navigator-iframe")
          .locator("p")
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    }
    await navigator.fill("");
    const views = page.getByRole("navigation", { name: "Library views and sources" });
    if (!(await views.isVisible())) {
      await page.getByRole("button", { name: "Toggle left sidebar" }).click();
    }
    await views.getByRole("button", { name: "All sources", exact: true }).click();
    await chooseOption(page.getByRole("combobox", { name: "Search scope" }), "documents");
    await page
      .getByRole("textbox", { name: "Search this view" })
      .fill(file.kind === "html" ? `"${file.query}"` : file.query);
    const result = page
      .getByRole("region", { name: "Text search results" })
      .getByRole("button", { name: new RegExp(`Passage ${index}`) });
    await expect(result).toBeVisible({ timeout: 30_000 });
    if (file.kind === "html") {
      expect(indexedFiles.has(index)).toBe(true);
      expect(openedFiles.has(index)).toBe(false);
    }
    await result.focus();
    await page.keyboard.press("Enter");
    const status = page.locator(".search-passage-status");
    await expect(status).toContainText(
      index === 3 ? "could not be verified" : `Matching passage: “${file.query}”`,
      { timeout: 20_000 },
    );
    await expect(status).toBeFocused();
    if (index === 0) {
      const highlight = await page
        .frameLocator(".document-session.is-active iframe.html-viewer")
        .locator("body")
        .evaluate((body) => {
          const range = body.ownerDocument.defaultView.CSS.highlights
            .get("reader-search-passage")
            .values()
            .next().value;
          const rect = range.getBoundingClientRect();
          return {
            text: range.toString(),
            top: rect.top,
            height: body.ownerDocument.defaultView.innerHeight,
          };
        });
      expect(highlight.text).toBe(file.query);
      expect(highlight.top).toBeGreaterThanOrEqual(0);
      expect(highlight.top).toBeLessThan(highlight.height);
      evidence.push(highlight);
    }
    if (file.kind === "pdf") {
      // The native viewer virtualizes pages; wait for the jump and page pixels, not just its ready event.
      await page.waitForTimeout(600);
      await expect
        .poll(() =>
          page
            .locator(".document-session.is-active .pdf-viewer img")
            .evaluateAll((images) =>
              images.some(
                (image) =>
                  image.complete &&
                  image.naturalWidth > 100 &&
                  image.getBoundingClientRect().top < image.ownerDocument.defaultView.innerHeight &&
                  image.getBoundingClientRect().bottom > 180,
              ),
            ),
        )
        .toBe(true);
    }
    evidence.push({
      kind: file.kind,
      query: file.query,
      unopenedIndexedPage: file.kind === "html",
      message: await status.textContent(),
    });
    if (index === 3) {
      expect(await status.textContent()).toContain("Find control");
      expect(
        await page
          .frameLocator(".document-session.is-active iframe.html-viewer")
          .locator("body")
          .evaluate((body) =>
            body.ownerDocument.defaultView.CSS.highlights.has("reader-search-passage"),
          ),
      ).toBe(false);
    }
    await page.screenshot({ path: join(directory, `${index}-${file.kind}.png`) });
  }
  expect(errors).toEqual([]);
  await writeFile(join(directory, "result.json"), JSON.stringify({ evidence, errors }, null, 2));
  console.log(
    `PASS: unopened indexed HTML passage activation/ambiguity fallback and loaded PDF/EPUB passages. Evidence: ${directory}`,
  );
} catch (error) {
  await page.screenshot({ path: join(directory, "failure.png") });
  await writeFile(join(directory, "failure.txt"), await page.locator("body").innerText());
  console.error(`Failure evidence: ${directory}`);
  throw error;
} finally {
  await browser.close();
}
