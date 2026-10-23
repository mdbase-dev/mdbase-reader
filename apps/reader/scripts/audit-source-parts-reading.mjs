/* global getComputedStyle -- evaluated inside the isolated browser page */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, expect } from "@playwright/test";

import { installLocalPdfium } from "./audit-local-pdfium.mjs";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5197";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Source-part audits require an explicitly owned loopback Vite origin.");
}
const directory = await mkdtemp(join(tmpdir(), "reader-source-parts-"));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await installLocalPdfium(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/?preview`);
  await page.getByText("Chapter 2", { exact: true }).first().dblclick();
  const boundary = page.getByRole("complementary", { name: "Chapter reading range" });
  await expect(boundary).toBeVisible({ timeout: 30000 });
  await expect(boundary).toContainText("Reading “Chapter 2”");
  await expect(boundary).toContainText("0% of chapter");
  await page.screenshot({ path: join(directory, "chapter-two-start.png") });
  // EmbedPDF's page field remains absolute and unrestricted.
  const pageNumber = page.locator(
    '.document-session.is-active .pdf-viewer input[type="text"]:not([aria-label])',
  );
  await expect(pageNumber).toHaveValue("11");
  // Check the real viewport too: an optimistic page field must not mask a startup reset.
  await expect
    .poll(() =>
      page.locator(".document-session.is-active .pdf-viewer *").evaluateAll((elements) => {
        const scroller = elements.find(
          (element) =>
            element.scrollHeight > element.clientHeight + 100 &&
            getComputedStyle(element).overflow === "auto",
        );
        return scroller ? scroller.scrollTop / scroller.scrollHeight : 0;
      }),
    )
    .toBeCloseTo(10 / 24, 1);
  await pageNumber.fill("21");
  await pageNumber.press("Enter");
  await expect(boundary).toContainText("End of “Chapter 2” — outside chapter");
  await expect(boundary).toContainText("100% of chapter");
  await expect(boundary.getByRole("status")).toHaveAttribute("aria-live", "polite");
  await boundary.getByRole("button", { name: "Start chapter" }).click();
  await expect(pageNumber).toHaveValue("11");
  await expect(boundary).toContainText("0% of chapter");
  await expect(boundary.getByRole("link", { name: /Continue in the book/u })).toBeVisible();
  await page.screenshot({ path: join(directory, "chapter-two-desktop.png") });
  await pageNumber.fill("16");
  await pageNumber.press("Enter");
  await expect(boundary).toContainText("50% of chapter");
  await page.waitForTimeout(1300); // The existing position writer intentionally debounces 1200ms.
  await boundary.getByRole("link", { name: /Continue in the book/u }).click();
  await expect(boundary).toHaveCount(0);
  await expect(pageNumber).toHaveValue("1");
  await page.getByRole("tab", { name: /Chapter 2/u }).click();
  await expect(pageNumber).toHaveValue("16");
  await expect(boundary).toContainText("50% of chapter");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(boundary).toBeVisible();
  await page.screenshot({ path: join(directory, "chapter-two-mobile.png") });
  expect(errors).toEqual([]);
  console.log(`Source-part preview audit passed. Screenshots: ${directory}`);
} finally {
  await browser.close();
}
