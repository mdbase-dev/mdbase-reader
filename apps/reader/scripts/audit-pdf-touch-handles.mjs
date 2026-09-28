/* global window, document */
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

import { installLocalPdfium } from "./audit-local-pdfium.mjs";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5197";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error("Loopback fixture only");
const directory = await mkdtemp(join(tmpdir(), "pdf-touch-handles-"));
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await installLocalPdfium(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/test-fixtures/pdf-touch-handles.html`);
  await expect(page.getByTestId("status")).toHaveText("Ready", { timeout: 30000 });
  await page.evaluate(async () => {
    window.testRegistry = await document.querySelector("embedpdf-container").registry;
  });
  await page.waitForFunction(() =>
    [
      ...document.querySelector("embedpdf-container").shadowRoot.querySelectorAll("div[style]"),
    ].some((el) => el.style.marginLeft === "auto" && el.style.position === "relative"),
  );
  const cdp = await context.newCDPSession(page);
  const touch = (type, point) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [],
    });
  const pointForGlyph = (index, pageIndex = 0, targetPage = page) =>
    targetPage.evaluate(
      async ({ index, pageIndex }) => {
        const registry = window.testRegistry;
        const document = registry.getPlugin("document-manager").provides().getActiveDocument();
        const geometry = await registry
          .getEngine()
          .getPageGeometry(document, document.pages[pageIndex])
          .toPromise();
        const run = geometry.runs.find(
          (run) => index >= run.charStart && index < run.charStart + run.glyphs.length,
        );
        const glyph = run.glyphs[index - run.charStart];
        const point = registry
          .getPlugin("scroll")
          .provides()
          .getRectPositionForPage(pageIndex, {
            origin: { x: glyph.x + glyph.width / 2, y: glyph.y + glyph.height / 2 },
            size: { width: 0, height: 0 },
          }).origin;
        const root = window.document.querySelector("embedpdf-container").shadowRoot;
        const box = [...root.querySelectorAll("div[style]")]
          .find((el) => el.style.marginLeft === "auto" && el.style.position === "relative")
          .getBoundingClientRect();
        return { x: box.left + point.x, y: box.top + point.y };
      },
      { index, pageIndex },
    );
  const state = () =>
    page.evaluate(async () => {
      const selection = window.testRegistry.getPlugin("selection").provides();
      const range = selection.getState().selection;
      return {
        range,
        text: range ? (await selection.getSelectedText().toPromise()).join("\n") : "",
      };
    });
  const hold = async (index) => {
    await touch("touchStart", await pointForGlyph(index));
    await page.waitForTimeout(500);
    await touch("touchEnd");
    await expect(page.locator('[data-reader-pdf-handle="start"]')).toBeVisible();
    await expect(page.getByTestId("quote")).not.toBeEmpty();
  };
  const drag = async (end, index, pageIndex = 0, linger = 0) => {
    const before = await state();
    const glyph = await pointForGlyph(before.range[end].index, before.range[end].page);
    const box = await page.locator(`[data-reader-pdf-handle="${end}"]`).boundingBox();
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const targetGlyph = await pointForGlyph(index, pageIndex);
    const target = { x: start.x + targetGlyph.x - glyph.x, y: start.y + targetGlyph.y - glyph.y };
    await touch("touchStart", start);
    // Pressing a handle must not dismiss or replace the existing selection.
    assert.deepEqual((await state()).range, before.range);
    await expect(page.getByTestId("quote")).toBeEmpty();
    for (let step = 1; step <= 12; step++) {
      await touch("touchMove", {
        x: start.x + ((target.x - start.x) * step) / 12,
        y: start.y + ((target.y - start.y) * step) / 12,
      });
      await page.waitForTimeout(20);
    }
    if (linger) await page.waitForTimeout(linger);
    await touch("touchEnd");
    await expect(page.getByTestId("quote")).not.toBeEmpty();
    const after = await state();
    await expect(page.getByTestId("quote")).toHaveText(after.text);
    return after;
  };

  await hold(43);
  const word = await state();
  console.log("hold", word);
  assert.equal(word.text, "Alpha");
  const extended = await drag("end", 67);
  console.log("extend", extended);
  assert.equal(extended.range.end.index, 67);
  assert.equal(extended.range.start.index, word.range.start.index);
  const shrunk = await drag("start", 48);
  assert.equal(shrunk.range.start.index, 48);
  assert.equal(shrunk.range.end.index, 67);
  const crossed = await drag("start", 85);
  console.log("cross", crossed);
  assert.deepEqual(crossed.range, { start: { page: 0, index: 67 }, end: { page: 0, index: 85 } });
  const multiline = await drag("end", 175);
  assert.equal(multiline.range.end.index, 175);
  await page.screenshot({ path: join(directory, "mobile-handles.png") });

  // Real application runtime publishes adjusted quote + geometry before Save becomes available.
  await page.getByRole("button", { name: "Save highlight" }).tap();
  await expect(page.getByTestId("saved")).toHaveText(multiline.text);
  await expect(page.locator('[data-reader-pdf-handle="start"]')).toBeHidden();
  assert.equal((await state()).range, null);
  await page.screenshot({ path: join(directory, "saved-highlight.png") });
  // Keyboard access uses the same settled-draft path.
  await hold(43);
  await page.locator('[data-reader-pdf-handle="end"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await state()).range.end.index).toBe(46);
  await expect(page.getByTestId("quote")).toHaveText((await state()).text);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-reader-pdf-handle="start"]')).toBeHidden();

  await hold(43);
  await page.evaluate(() => window.testRegistry.getPlugin("zoom").provides().requestZoom(1.5));
  await page.waitForTimeout(250);
  await page.evaluate(() =>
    window.testRegistry
      .getPlugin("scroll")
      .provides()
      .scrollToPage({ pageNumber: 1, alignY: 0, behavior: "instant" }),
  );
  await page.waitForTimeout(200);
  const zoomed = await drag("end", 53);
  assert.equal(zoomed.range.end.index, 53);
  await page.screenshot({ path: join(directory, "zoomed-handles.png") });

  // Test all page rotations, including inverse pointer-coordinate mapping.
  for (let rotation = 1; rotation <= 3; rotation++) {
    await page.evaluate(() => {
      window.testRegistry.getPlugin("rotate").provides().rotateForward();
      window.testRegistry.getPlugin("zoom").provides().requestZoom("fit-page");
    });
    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.testRegistry
        .getPlugin("scroll")
        .provides()
        .scrollToPage({ pageNumber: 1, alignY: 0, behavior: "instant" }),
    );
    await page.waitForTimeout(200);
    const rotated = await drag("end", rotation % 2 ? 58 : 53);
    assert.equal(rotated.range.end.index, rotation % 2 ? 58 : 53);
    await page.screenshot({ path: join(directory, `rotation-${rotation}.png`) });
  }
  await page.evaluate(() => {
    window.testRegistry.getPlugin("selection").provides().clear();
    window.testRegistry.getPlugin("rotate").provides().rotateForward();
    window.testRegistry.getPlugin("zoom").provides().requestZoom("fit-width");
  });
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    window.testRegistry
      .getPlugin("scroll")
      .provides()
      .scrollToPage({ pageNumber: 1, alignY: 0, behavior: "instant" }),
  );
  await page.waitForTimeout(200);
  await hold(43);
  const endBox = await page.locator('[data-reader-pdf-handle="end"]').boundingBox();
  const start = { x: endBox.x + 22, y: endBox.y + 22 };
  await touch("touchStart", start);
  for (let step = 1; step <= 15; step++) {
    await touch("touchMove", { x: start.x, y: start.y + ((832 - start.y) * step) / 15 });
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(1600);
  await touch("touchEnd");
  await expect(page.getByTestId("quote")).not.toBeEmpty();
  const scrolled = await state();
  assert.equal(scrolled.range.start.page, 0);
  assert.equal(scrolled.range.end.page, 1);
  await expect(page.getByTestId("quote")).toHaveText(scrolled.text);
  await page.screenshot({ path: join(directory, "cross-page-autoscroll.png") });
  console.log("autoscroll", scrolled.range);

  // Cancellation and app/window interruption settle the last range and stop dragging.
  for (const interruption of ["touchCancel", "blur", "replace"]) {
    await page.evaluate(() => {
      window.testRegistry.getPlugin("selection").provides().clear();
      window.testRegistry
        .getPlugin("scroll")
        .provides()
        .scrollToPage({ pageNumber: 1, alignY: 0, behavior: "instant" });
    });
    await page.waitForTimeout(200);
    await hold(43);
    const cancelBox = await page.locator('[data-reader-pdf-handle="end"]').boundingBox();
    await touch("touchStart", { x: cancelBox.x + 22, y: cancelBox.y + 22 });
    await touch("touchMove", { x: cancelBox.x + 60, y: cancelBox.y + 22 });
    await page.waitForTimeout(100);
    if (interruption === "touchCancel") {
      await touch("touchCancel");
    } else {
      if (interruption === "blur") {
        await page.evaluate(() => window.dispatchEvent(new window.Event("blur")));
      } else {
        await page.evaluate(() =>
          window.testRegistry
            .getPlugin("selection")
            .provides()
            .setSelection({ start: { page: 0, index: 83 }, end: { page: 0, index: 87 } })
            .toPromise(),
        );
      }
      await touch("touchEnd");
    }
    await expect(page.locator("[data-reader-pdf-handle][data-dragging]")).toHaveCount(0);
    await expect(page.getByTestId("quote")).toHaveText((await state()).text);
    const cancelled = await state();
    await page.waitForTimeout(150);
    assert.deepEqual(await state(), cancelled);
  }

  // A blank tap dismisses, and an ordinary swipe still pans rather than selecting text.
  await page.touchscreen.tap(345, 400);
  await expect(page.locator('[data-reader-pdf-handle="start"]')).toBeHidden();
  await touch("touchStart", { x: 345, y: 650 });
  await touch("touchMove", { x: 345, y: 400 });
  await touch("touchEnd");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.testRegistry.getPlugin("viewport").provides().getMetrics().scrollTop,
      ),
    )
    .toBeGreaterThan(100);
  assert.equal((await state()).range, null);

  // Coarse-pointer enhancement must not change desktop selection or add desktop handles.
  const desktopContext = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await installLocalPdfium(desktopContext);
  const desktop = await desktopContext.newPage();
  desktop.on("pageerror", (error) => errors.push(error.message));
  await desktop.goto(`${origin}/test-fixtures/pdf-touch-handles.html`);
  await expect(desktop.getByTestId("status")).toHaveText("Ready", { timeout: 30000 });
  await desktop.evaluate(async () => {
    window.testRegistry = await document.querySelector("embedpdf-container").registry;
  });
  await desktop.waitForFunction(() =>
    [
      ...document.querySelector("embedpdf-container").shadowRoot.querySelectorAll("div[style]"),
    ].some((el) => el.style.marginLeft === "auto"),
  );
  const desktopPoint = await pointForGlyph(43, 0, desktop);
  await desktop.mouse.dblclick(desktopPoint.x, desktopPoint.y);
  await expect(desktop.getByTestId("quote")).toHaveText("Alpha");
  await expect(desktop.locator("[data-reader-pdf-handle]")).toHaveCount(0);
  await desktopContext.close();

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", directory, errors }));
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages())
      await page.screenshot({ path: join(directory, "failure.png") }).catch(() => {});
  console.error({ directory, errors });
  throw error;
} finally {
  await browser.close();
}
