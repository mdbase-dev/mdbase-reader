import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { installLocalPdfium } from "./audit-local-pdfium.mjs";

export async function staticBoot(browser, origin) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/?preview=1`);
    await expect(page.getByRole("main", { name: "Loading Reader", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Loading Reader");
    await page.locator(".reader-boot summary").click();
    await expect(page.getByRole("link", { name: "reload Reader", exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
}

export async function retainedCitation(page) {
  await expect
    .poll(() => page.workers().some((worker) => worker.url().includes("citation-worker")))
    .toBe(true);
  const inspector = page.getByRole("complementary", { name: "Source workspace", exact: true });
  const editor = inspector.locator(".citation-editor");
  await expect(editor.getByRole("button", { name: "Copy", exact: true })).toBeEnabled();
  await expect(editor.locator(".citation-reference-text")).toContainText("James");
  await editor.evaluate((element) => {
    element.dataset.retentionProbe = "retained";
  });
  await inspector.getByRole("tab", { name: /^Annotations/u }).click();
  await expect(editor).toBeHidden();
  await inspector.getByRole("tab", { name: "Citation", exact: true }).click();
  await expect(editor).toHaveAttribute("data-retention-probe", "retained");
  await expect(editor).toBeVisible();
}

export async function round4Library(page) {
  const mode = page.locator(".library-mode");
  assert.equal(await mode.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
  const row = page.locator(".library-table-row[data-row-index]").first();
  await expect(row.locator(".library-status")).toBeVisible();
  const before = await row.locator(".library-status").getAttribute("class");
  await row.focus();
  await page.keyboard.press("s");
  await page.getByRole("option", { name: "Finished", exact: true }).click();
  await expect(page.locator("#reader-notices")).toContainText("Finished");
  await page.keyboard.press("Control+z");
  await expect(row.locator(".library-status")).toHaveAttribute("class", before);
  await expect(page.locator("#reader-notices")).toContainText("Restored the status");
}

export async function readingKeys(page) {
  const viewport = page.viewportSize();
  if (viewport.width > 680) {
    await page.setViewportSize({ ...viewport, height: 600 });
  }
  const frame = page.locator("iframe.html-viewer");
  const scroll = () => frame.evaluate((element) => element.contentWindow.scrollY);
  await expect
    .poll(() =>
      frame.evaluate(
        (element) => element.contentDocument.documentElement.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      frame.evaluate(
        (element) => element.contentDocument.activeElement === element.contentDocument.body,
      ),
    )
    .toBe(true);
  const before = await scroll();
  await page.keyboard.press("PageDown");
  await expect.poll(scroll).toBeGreaterThan(before);
  await page.keyboard.press("Control+Home");
  await expect.poll(scroll).toBe(0);
  await page.setViewportSize(viewport);
  await page
    .frameLocator("iframe.html-viewer")
    .locator("body")
    .click({ position: { x: 8, y: 8 } });
  await expect(page.locator(".reader-shell")).not.toHaveAttribute("data-chrome-hidden");
  await page.evaluate(() => {
    globalThis.document.activeElement.blur();
    globalThis.document.body.tabIndex = -1;
    globalThis.document.body.focus();
  });
  await page.keyboard.press("F6");
  await expect
    .poll(() =>
      frame.evaluate(
        (element) =>
          element.contentDocument.activeElement === element.contentDocument.body &&
          globalThis.document.activeElement === element,
      ),
    )
    .toBe(true);
}

export async function desktopPdfNavigation(page) {
  const host = page.locator("embedpdf-container");
  await host.getByRole("button", { name: "Sidebar", exact: true }).click();
  await expect(host.getByRole("dialog", { name: "PDF navigation" })).toHaveCount(0);
  const thumbnails = host.getByRole("tab", { name: "Thumbnails", exact: true });
  const outline = host.getByRole("tab", { name: "Outline", exact: true });
  await thumbnails.focus();
  await page.keyboard.press("ArrowRight");
  await expect(outline).toBeFocused();
  await page.keyboard.press("Home");
  await expect(thumbnails).toBeFocused();
  await expect(thumbnails).toHaveAttribute("aria-selected", "true");
  const thumbnail = host.getByRole("button", { name: "Page 3", exact: true });
  await thumbnail.focus();
  await page.keyboard.press("Enter");
  await expect(host.getByRole("textbox", { name: "Page", exact: true })).toHaveValue("3");
  await assertPdfTabContrast(thumbnails);
  await host.getByRole("button", { name: "Sidebar", exact: true }).click();
}

export async function assertPdfTabContrast(tab) {
  const ratio = await tab.evaluate((element) => {
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    const luminance = (color) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
      const linear = [red, green, blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const ink = luminance(globalThis.getComputedStyle(element.querySelector("svg")).color);
    const backing = luminance(globalThis.getComputedStyle(element).backgroundColor);
    return (Math.max(ink, backing) + 0.05) / (Math.min(ink, backing) + 0.05);
  });
  assert.ok(ratio >= 3, `Selected PDF tab icon contrast ${ratio}:1`);
}

export async function offlinePdf(context, origin, command) {
  const isolated = await context.browser().newContext();
  await installLocalPdfium(isolated);
  const page = await isolated.newPage();
  try {
    await page.goto(`${origin}/?preview=1`);
    await page.locator('.library-table[aria-label="Sources"]').waitFor();
    await isolated.setOffline(true);
    await command(page, "anthology");
    const problem = page.locator('.document-renderer-status [role="alert"]');
    await expect(problem).toContainText("offline");
    await expect(page.locator('.document-renderer-status [role="status"]')).toHaveCount(0);
    await expect(page.locator("embedpdf-container")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close Document", exact: true })).toHaveCount(0);
    await problem.getByRole("button", { name: "Try again", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.notEqual(
      await page.evaluate(() => globalThis.document.activeElement?.getAttribute("aria-label")),
      "Close Document",
    );
    await expect(page.locator(".workspace-pane.is-focused .document-canvas")).not.toContainText(
      "TypeError",
    );
    await expect(page.locator(".workspace-pane.is-focused .document-canvas")).not.toContainText(
      "outside this chapter",
    );
    await isolated.setOffline(false);
    await problem.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.locator("embedpdf-container").getByRole("region", { name: "PDF pages", exact: true }),
    ).toBeVisible();
    await expect(problem).toHaveCount(0);
  } finally {
    await isolated.close();
  }
}
