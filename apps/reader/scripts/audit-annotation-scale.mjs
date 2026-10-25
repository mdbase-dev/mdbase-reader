/* global KeyboardEvent */
import { chromium, expect } from "@playwright/test";

import { chooseOption } from "./audit-select.mjs";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5193";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin))
  throw new Error("Loopback fixture only");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const card = (number) => page.locator(`[data-item-id="scale_${String(number).padStart(4, "0")}"]`);
const list = page.locator(".annotation-list");
const inViewport = async (number) => {
  await expect
    .poll(async () =>
      card(number)
        .evaluate((item) => {
          const rect = item.getBoundingClientRect();
          const viewport = item.closest(".annotation-list").getBoundingClientRect();
          return rect.top < viewport.bottom && rect.bottom > viewport.top;
        })
        .catch(() => false),
    )
    .toBe(true);
};
try {
  await page.goto(`${origin}/test-fixtures/annotation-scale.html?count=3000`);
  await page.getByRole("button", { name: "Mount annotations" }).click();
  await expect(page.getByRole("listitem").first()).toHaveAttribute("aria-setsize", "3000");
  expect(await page.getByRole("listitem").count()).toBeLessThan(20);
  const heights = await page
    .getByRole("listitem")
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
  expect(new Set(heights).size).toBeGreaterThan(2);
  await card(0).focus();
  await list.evaluate((element) => {
    element.scrollTop = 100000;
  });
  await expect
    .poll(() =>
      page
        .getByRole("listitem")
        .evaluateAll((items) => Math.max(...items.map((item) => Number(item.dataset.index)))),
    )
    .toBeGreaterThan(100);
  await expect(card(0)).toBeFocused();
  expect(await page.getByRole("listitem").count()).toBeLessThan(25);
  await card(0).press("End");
  await expect(card(2999)).toBeFocused();
  await inViewport(2999);
  await card(2999).press("Home");
  await expect(card(0)).toBeFocused();
  await card(0).press("ArrowDown");
  await expect(card(1)).toBeFocused();
  await card(1).press("Shift+Tab");
  await expect(card(0).getByRole("button", { name: "Show in document" })).toBeFocused();
  await page.getByRole("button", { name: "Select last annotation" }).click();
  await inViewport(2999);
  const search = page.getByRole("searchbox", { name: "Search annotations" });
  await search.fill("Passage 1499:");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(card(1499)).toHaveAttribute("aria-posinset", "1");
  await expect(card(1499)).toHaveAttribute("aria-setsize", "1");
  await inViewport(1499);
  await page.getByRole("checkbox", { name: "Include all annotations in page search" }).check();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Include all annotations in page search" }).uncheck();
  await search.fill("no-such-passage");
  await expect(page.getByText("No matching annotations", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.locator('summary[aria-label="Filter and sort annotations"]').click();
  await chooseOption(page.getByRole("combobox", { name: "Filter annotations" }), "bookmark");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listitem").first()).toHaveAttribute("aria-setsize", "600");
  expect(await page.getByRole("listitem").count()).toBeLessThan(25);
  await search.fill("p. 1501");
  await expect(card(1500)).toHaveAttribute("aria-setsize", "1");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  // Native Find is not hijacked: Ctrl+F in this pane expands matching cards and keeps default.
  await search.focus();
  const prevented = await search.evaluate(
    (element) =>
      !element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }),
      ),
  );
  expect(prevented).toBe(false);
  await expect(page.getByRole("listitem")).toHaveCount(3000);
  await page.getByRole("checkbox", { name: "Include all annotations in page search" }).uncheck();
  await expect.poll(() => page.getByRole("listitem").count()).toBeLessThan(25);
  await page.getByRole("button", { name: "Read middle" }).click();
  await page.getByRole("button", { name: "Follow reading", exact: true }).click();
  await inViewport(1500);
  await expect(card(1500)).toHaveAttribute("aria-current", "location");
  await list.hover();
  await page.mouse.wheel(0, -700);
  await expect(page.getByRole("button", { name: "Follow reading", exact: true })).toBeVisible();
  const offset = await list.evaluate((element) => element.scrollTop);
  await page.getByRole("button", { name: "Read earlier" }).click();
  await expect(page.getByText("Near reading position: p. 1001", { exact: true })).toBeVisible();
  expect(Math.abs((await list.evaluate((element) => element.scrollTop)) - offset)).toBeLessThan(5);
  await page.getByRole("button", { name: "Follow reading", exact: true }).click();
  await inViewport(1000);
  await expect(card(1000)).toHaveAttribute("aria-current", "location");
  await page.screenshot({
    path: process.env.READER_SCALE_SCREENSHOT ?? "/tmp/annotation-scale-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  // Fixture width adapts to narrow screens just like the workbench.
  await page.screenshot({ path: "/tmp/annotation-scale-mobile.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS: variable-height windowing, selection, focus pinning, keyboard traversal, search/filter, native Find mode, reading-follow pause/resume, list semantics",
  );
} finally {
  await browser.close();
}
