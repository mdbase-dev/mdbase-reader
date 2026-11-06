import assert from "node:assert/strict";
import { after, test } from "node:test";
import { chromium, expect } from "@playwright/test";
import { chooseOption } from "./audit-select.mjs";

const browser = await chromium.launch({ headless: true });
const origin = "http://127.0.0.1:5193/?preview=1";
after(() => browser.close());

async function skipToSources(page, target) {
  await page.evaluate(() => {
    globalThis.document.body.tabIndex = -1;
    globalThis.document.body.focus();
  });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to sources", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(target).toBeFocused();
}

test("Escape then immediate A never changes status (20 real keyboard trials)", async () => {
  const page = await browser.newPage({ viewport: { width: 1042, height: 662 } });
  const trials = [];
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.goto(origin);
      const table = page.locator('.library-table[aria-label="Sources"]');
      await table.waitFor();
      await table.focus();
      await page.keyboard.press("s");
      const picker = page.locator('.library-table-row[data-row-index="0"] [role="combobox"]');
      await expect(picker).toHaveAttribute("aria-expanded", "true");
      const before = await picker.getAttribute("data-value");
      await page.keyboard.press("Escape");
      await page.keyboard.press("a");
      trials.push({
        before,
        after: await picker.getAttribute("data-value"),
        addOpened: await page.locator(".source-add-dialog[open]").count(),
      });
    }
    console.log(JSON.stringify({ immediateEscapeTrials: trials }));
    assert.equal(trials.filter(({ before, after }) => before !== after).length, 0);
    assert.ok(trials.every(({ addOpened }) => addOpened === 1));
  } finally {
    await page.close();
  }
});

test("Skip to sources reaches cards in Visual library", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(origin);
    await page
      .getByRole("navigation", { name: "Library views and sources" })
      .getByRole("button", { name: "Visual library", exact: true })
      .click();
    const card = page.locator(".library-card-hit-target").first();
    await expect(card).toBeVisible();
    await skipToSources(page, card);
  } finally {
    await page.close();
  }
});

test("Skip to sources reaches the results region for empty Table, Cards and text search", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(origin);
    const search = page.getByRole("textbox", { name: "Search this view", exact: true });
    await search.fill("no-source-matches-this-query");
    await expect(page.getByText("No sources match", { exact: true })).toBeVisible();
    const results = page.locator(".workspace-pane.is-focused .library-workspace-results");
    await skipToSources(page, results);
    await page.locator('summary[aria-label="Display"]').click();
    await page.getByRole("button", { name: "Cards", exact: true }).click();
    await page.keyboard.press("Escape");
    await skipToSources(page, results);
    await chooseOption(page.getByRole("combobox", { name: "Search scope" }), "notes");
    await search.fill("attention");
    await expect(page.locator(".library-text-search")).toBeVisible();
    await expect(page.locator(".search-passage-list button")).toHaveCount(0);
    await skipToSources(page, results);
  } finally {
    await page.close();
  }
});
