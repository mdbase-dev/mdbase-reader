// Sample-data acceptance only. Intercepts every feedback POST; never sends mail.
/* global window */
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const origin = process.env.READER_FEEDBACK_TEST_ORIGIN ?? "http://127.0.0.1:8891";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Feedback acceptance requires a loopback preview.");
}
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
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
            return Promise.reject(new DOMException("Cancelled", "NotAllowedError"));
          },
        },
      });
    });
    await page.goto(`${origin}/?preview`);
    const trigger = page
      .locator(".reader-header")
      .getByRole("button", { name: "Send feedback", exact: true });
    await trigger.click();
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
  console.log("Reader feedback desktop/mobile acceptance passed; all delivery intercepted.");
} finally {
  await browser.close();
}
