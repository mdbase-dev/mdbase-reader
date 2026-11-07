// Sample-data acceptance only. Intercepts every feedback POST; never sends mail.
/* global window, document, requestAnimationFrame, getComputedStyle */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const origin = process.env.READER_FEEDBACK_TEST_ORIGIN ?? "http://127.0.0.1:8891";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Feedback acceptance requires a loopback preview.");
}
const browser = await chromium.launch();
const motion = [];
async function trace(page, action) {
  return page.evaluate(async (action) => {
    if (action === "open")
      document.querySelector(".reader-header .mdbase-feedback-trigger").click();
    else
      document
        .querySelector(".mdbase-feedback-dialog")
        .dispatchEvent(new Event("cancel", { cancelable: true }));
    const start = performance.now();
    const samples = [];
    while (performance.now() - start < 300) {
      await new Promise(requestAnimationFrame);
      const dialog = document.querySelector(".mdbase-feedback-dialog");
      samples.push({
        time: performance.now() - start,
        visible: dialog !== null && dialog.getClientRects().length > 0,
        opacity: dialog ? Number(getComputedStyle(dialog).opacity) : 0,
        animations: document
          .getAnimations()
          .filter((animation) => animation.effect?.target === dialog)
          .map((animation) => ({
            property: animation.transitionProperty,
            duration: animation.effect.getTiming().duration,
          })),
      });
    }
    return samples;
  }, action);
}
function assertMotion(samples, duration, reducedMotion) {
  if (reducedMotion === "reduce") {
    assert.ok(
      samples.every(
        ({ animations, opacity }) => !animations.length && (opacity === 0 || opacity === 1),
      ),
    );
  } else {
    assert.ok(
      samples.some(({ animations }) =>
        animations.some(
          (animation) => animation.property === "opacity" && animation.duration === duration,
        ),
      ),
    );
    assert.ok(samples.some(({ opacity }) => opacity > 0 && opacity < 1));
  }
}
try {
  for (const width of [1440, 390]) {
    for (const colorScheme of ["light", "dark"]) {
      for (const reducedMotion of ["no-preference", "reduce"]) {
        const context = await browser.newContext({
          viewport: { width, height: width === 390 ? 844 : 900 },
          colorScheme,
          reducedMotion,
        });
        const page = await context.newPage();
        const posts = [];
        await context.route("**/v1/feedback", async (route) => {
          posts.push(route.request().postDataJSON());
          await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        });
        await page.addInitScript(() => {
          window.feedbackCaptures = 0;
          Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
              getDisplayMedia: () => {
                window.feedbackCaptures++;
                const dialog = document.querySelector(".mdbase-feedback-dialog");
                window.feedbackCaptureVisible =
                  dialog !== null && dialog.getClientRects().length > 0;
                return Promise.reject(new DOMException("Cancelled", "NotAllowedError"));
              },
            },
          });
        });
        await page.goto(`${origin}/?preview`);
        const trigger = page
          .locator(".reader-header")
          .getByRole("button", { name: "Send feedback", exact: true });
        await expect(trigger).toBeVisible();
        await expect(page.locator(".mdbase-feedback-dialog")).toHaveCount(0);
        const enter = await trace(page, "open");
        assertMotion(enter, 160, reducedMotion);
        await expect(
          page.getByRole("dialog", { name: "Send feedback", exact: true }),
        ).toBeVisible();
        const exit = await trace(page, "close");
        assertMotion(exit, 120, reducedMotion);
        assert.equal(exit.at(-1).visible, false);
        await expect(page.locator(".mdbase-feedback-dialog")).toHaveCount(0);
        await trigger.click();
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await expect(page.locator(".mdbase-feedback-dialog")).toHaveCount(0);
        await trigger.click();
        await expect(page.locator(".mdbase-feedback-dialog")).toHaveAttribute("open");
        await page.waitForTimeout(200);
        motion.push({ width, colorScheme, reducedMotion, enter, exit });
        const dialog = page.getByRole("dialog", { name: "Send feedback", exact: true });
        const message = dialog.getByLabel("What happened?");
        await expect(message).toBeFocused();
        await expect(dialog.locator("details")).not.toHaveAttribute("open");
        assert.equal(await page.evaluate(() => window.feedbackCaptures), 0);
        await message.fill("A private sample draft");
        await page.screenshot({ path: `/tmp/shared-feedback-reader-form-${width}.png` });
        await message.press("Control+k");
        assert.equal(await page.locator("dialog[open]").count(), 1);
        await message.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await expect(message).toHaveValue("A private sample draft");
        await dialog.getByRole("button", { name: "Attach screenshot", exact: true }).click();
        await expect(dialog.getByRole("status")).toContainText("No screenshot taken");
        assert.equal(await page.evaluate(() => window.feedbackCaptures), 1);
        assert.equal(await page.evaluate(() => window.feedbackCaptureVisible), false);
        await dialog.getByRole("button", { name: "Send feedback", exact: true }).click();
        await expect(dialog.getByRole("heading", { name: "Thanks for the report." })).toBeFocused();
        assert.equal(posts.length, 1);
        const payload = posts[0];
        assert.equal(payload.schema_version, 2);
        assert.equal(payload.application.product, "mdbase reader");
        assert.ok(["library", "document"].includes(payload.application.source_view));
        for (const key of ["context", "diagnostics", "screenshot", "reply_email"])
          assert.equal(payload[key], undefined);
        await page.screenshot({ path: `/tmp/shared-feedback-reader-${width}.png` });
        await context.close();
      }
    }
  }
  await writeFile("/tmp/reader-feedback-motion.json", JSON.stringify(motion, null, 2));
  console.log("Reader feedback desktop/mobile acceptance passed; all delivery intercepted.");
} finally {
  await browser.close();
}
