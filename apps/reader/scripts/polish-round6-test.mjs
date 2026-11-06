import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { sampleAction } from "./polish-round3-cases.mjs";

const browser = await chromium.launch({ headless: true });
const origin = "http://127.0.0.1:5193";
const evidence = {};

async function layoutAndTouchEvidence() {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${origin}/?preview=1`);
  await desktop.locator('.library-table[aria-label="Sources"]').waitFor();
  await desktop.evaluate(() => {
    globalThis.document.body.tabIndex = -1;
    globalThis.document.body.focus();
  });
  await desktop.keyboard.press("Tab");
  await expect(desktop.getByRole("link", { name: "Skip to sources" })).toBeFocused();
  await desktop.keyboard.press("Enter");
  await expect(desktop.locator('.library-table-row[data-row-index="0"]')).toBeFocused();
  evidence.skipLinkTabs = 1;
  const notes = desktop.getByRole("button", { name: "Toggle Notes panel", exact: true });
  const firstNotes = await sampleAction(desktop, () => notes.click(), ".library-table");
  evidence.firstNotesMotion = firstNotes
    .flatMap(({ animations }) => animations)
    .filter(({ property, edge }) => property === "transform" && edge === "right");
  assert.ok(evidence.firstNotesMotion.some(({ duration }) => duration === 220));
  await notes.click();
  await desktop.waitForTimeout(250);
  const laterNotes = await sampleAction(desktop, () => notes.click(), ".library-table");
  evidence.laterNotesMotion = laterNotes
    .flatMap(({ animations }) => animations)
    .filter(({ property, edge }) => property === "transform" && edge === "right");
  assert.ok(evidence.laterNotesMotion.some(({ duration }) => duration === 220));
  assert.ok(
    [...evidence.firstNotesMotion, ...evidence.laterNotesMotion].every(
      ({ easing }) => easing === "cubic-bezier(0.22, 1, 0.36, 1)",
    ),
  );
  const scroller = desktop.locator(".library-table-frame");
  const card = desktop.locator(".continue-reading-card").first();
  const before = await card.boundingBox();
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.scrollTop = 150;
  });
  const after = await card.boundingBox();
  evidence.gridOverflow = await scroller.evaluate((element) => {
    const results = element.closest(".library-workspace-results");
    const header = element.querySelector(".library-table-head");
    return {
      scrollLeft: element.scrollLeft,
      outerOverflow: results.scrollWidth - results.clientWidth,
      stickyHeaderOffset: header.getBoundingClientRect().top - element.getBoundingClientRect().top,
    };
  });
  evidence.continueReadingShift = after.x - before.x;
  assert.ok(evidence.gridOverflow.scrollLeft > 0);
  assert.equal(evidence.gridOverflow.outerOverflow, 0);
  assert.equal(evidence.continueReadingShift, 0);
  assert.ok(Math.abs(evidence.gridOverflow.stickyHeaderOffset) <= 1);
  await desktop.locator('.library-table-row[data-row-index="0"]').focus();
  await desktop.keyboard.press("s");
  await desktop.getByRole("option", { name: "Finished", exact: true }).click();
  evidence.statusMotion = await desktop
    .locator('.library-table-row[data-row-index="0"] .library-status-mark')
    .evaluate((element) => ({
      properties: globalThis.getComputedStyle(element).transitionProperty,
      frames: element.getAnimations().flatMap((animation) => animation.effect.getKeyframes()),
    }));
  assert.match(evidence.statusMotion.properties, /background-color/u);
  assert.ok(evidence.statusMotion.frames.length > 0);
  await desktop.close();
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await touch.newPage();
  await phone.goto(`${origin}/?preview=1`);
  const row = phone.locator('.library-table-row[data-row-index="0"]');
  await row.waitFor();
  evidence.phoneStatusBox = await row.locator('[role="combobox"]').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  assert.ok(evidence.phoneStatusBox.width >= 44 && evidence.phoneStatusBox.height >= 44);
  const title = await row.locator(".library-title-copy strong").innerText();
  await row.locator(".library-title-copy").tap();
  await expect(phone.locator(".workspace-pane.is-document-pane.is-focused")).toHaveAttribute(
    "aria-label",
    title,
  );
  evidence.oneTouchOpens = true;
  await touch.close();
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 600 } });
  let page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(`${origin}/?preview=1`);
  await page.locator('.library-table[aria-label="Sources"]').waitFor();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search sources and commands", exact: true })
    .fill("psychology");
  await page.keyboard.press("Enter");
  const frame = page.locator("iframe.html-viewer");
  await expect(
    page.getByRole("status").filter({ hasText: "Ready to read The Principles of Psychology" }),
  ).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator(".mdbase-command-palette")).toBeHidden();
  await frame.evaluate((element) => element.contentDocument.body.focus());
  await frame.evaluate((element) => {
    element.contentWindow.readerKeyProbe = [];
    element.contentDocument.addEventListener("keydown", (event) => {
      element.contentWindow.readerKeyProbe.push({
        key: event.key,
        ctrl: event.ctrlKey,
        prevented: event.defaultPrevented,
      });
    });
  });
  evidence.scroll = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press("Control+Home");
    await expect.poll(() => frame.evaluate((element) => element.contentWindow.scrollY)).toBe(0);
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(150);
    const mid = await frame.evaluate((element) => element.contentWindow.scrollY);
    await page.keyboard.press("Control+Home");
    await page.waitForTimeout(400);
    evidence.scroll.push({
      mid,
      end: await frame.evaluate((element) => element.contentWindow.scrollY),
    });
  }
  evidence.keys = await frame.evaluate((element) => element.contentWindow.readerKeyProbe);
  page = await browser.newPage({ viewport: { width: 1042, height: 662 } });
  await page.goto(`${origin}/?preview=1`);
  const table = page.locator('.library-table[aria-label="Sources"]');
  await table.waitFor();
  await page.clock.install();
  await page.evaluate(() => {
    globalThis.window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
    globalThis.window.dispatchEvent(new Event("mdbase:reader-document-opened"));
  });
  await page.clock.runFor(30001);
  await expect(page.locator(".pwa-install")).toBeVisible();
  const row = page.locator('.library-table-row[data-row-index="0"]');
  await row.click({ button: "right" });
  const remove = page.getByRole("menuitem", { name: "Remove source…", exact: true });
  await expect(remove).toBeVisible();
  evidence.removeHit = await remove.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.contains(
      globalThis.document.elementFromPoint(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      ),
    );
  });
  evidence.installDuringMenu = await page.locator(".pwa-install").count();
  await page.screenshot({ path: join(tmpdir(), "reader-r6-remove-hit.png") });
  await layoutAndTouchEvidence();
  console.log(JSON.stringify(evidence, null, 2));
  assert.ok(evidence.scroll.every(({ mid, end }) => mid > 0 && end === 0));
  assert.equal(evidence.removeHit, true);
  assert.equal(evidence.installDuringMenu, 0);
} finally {
  console.log(JSON.stringify(evidence));
  await browser.close();
}
