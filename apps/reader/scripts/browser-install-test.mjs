// Loopback-only interface preview: installation event is controlled, collection data stays in memory.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:48334/";
const origin = new URL(base).origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
);
const page = await context.newPage();
try {
  await page.goto(`${base}?preview=1`);
  await page
    .getByRole("button", { name: "Continue reading The Principles of Psychology", exact: true })
    .click();
  await page.getByRole("navigation", { name: "Source views", exact: true }).waitFor();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    globalThis.dispatchEvent(event);
  });
  await page.locator(".pwa-install").waitFor({ timeout: 35000 });
  for (const [width, height] of [
    [390, 844],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    for (const name of ["Read", "Annotations", "Note", "Citation"]) {
      await page
        .getByRole("navigation", { name: "Source views", exact: true })
        .getByRole("button", { name, exact: true })
        .click();
      const geometry = await page.evaluate(() => {
        const prompt = globalThis.document.querySelector(".pwa-install").getBoundingClientRect();
        const nav = globalThis.document
          .querySelector(".mobile-source-views")
          .getBoundingClientRect();
        return {
          gap: nav.top - prompt.bottom,
          fits: prompt.left >= 0 && prompt.right <= globalThis.innerWidth,
          top: prompt.top,
        };
      });
      assert.ok(geometry.gap >= 8, `${width}px ${name}: ${JSON.stringify(geometry)}`);
      assert.equal(geometry.fits, true);
      assert.ok(geometry.top >= 0);
    }
    console.log(
      `PASS install invitation leaves all four source controls reachable at ${width}x${height}`,
    );
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator(".mobile-source-views").waitFor({ state: "detached" });
  assert.equal(
    await page.locator(".pwa-install").evaluate((e) => globalThis.getComputedStyle(e).bottom),
    "16px",
  );
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  assert.equal(await page.locator(".pwa-install").count(), 0);
  console.log("PASS desktop positioning and dismissal");
} finally {
  await context.close();
  await browser.close();
}
