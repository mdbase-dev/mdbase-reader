import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

const origin = process.env.READER_PERF_ORIGIN ?? "http://127.0.0.1:5297";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
  throw new Error("Use an explicit loopback production preview, never LAB or a collection.");
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/?preview=1`);
  await page.getByText("The Principles of Psychology", { exact: true }).first().waitFor();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error("Offline shell did not activate");
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Neither the HTML renderer nor settings/citation editor has been visited yet.
  await context.setOffline(true);
  await page.reload();
  await page.getByText("The Principles of Psychology", { exact: true }).first().dblclick();
  await page.waitForFunction(() =>
    globalThis.document
      .querySelector("iframe.html-viewer")
      ?.contentDocument?.body?.textContent?.includes("Attention"),
  );
  await page.getByLabel("Display settings", { exact: true }).first().click();
  await page.getByRole("group", { name: "Theme", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Toggle Notes panel", exact: true }).click();
  await page.getByRole("tab", { name: "Citation", exact: true }).click();
  await page.getByRole("button", { name: /^(?:Fix|Edit) details$/u }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Offline production shell reload, unvisited HTML renderer, display settings and citation editor passed; no page errors.",
  );
} finally {
  await browser.close();
}
