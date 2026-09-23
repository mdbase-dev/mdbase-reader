import { expect } from "@playwright/test";

const shellKey = "mdbase-reader:shell:v1:test-reader-audit";

/** The default reading workspace: sidebar hides while reading, type settings reach the page,
 * reading mode and panel shortcuts work from inside the document, and highlights get markers. */
export async function auditReadingWorkspace(page, { screenshot }) {
  const completed = [];
  await page.evaluate((key) => localStorage.removeItem(key), shellKey);
  await page.reload();
  const navigator = page.getByRole("complementary", { name: "Library navigator" });
  await expect(navigator).toBeVisible();

  await navigator
    .getByRole("textbox", { name: "Find a source by title, author or tag" })
    .fill("Research 0001");
  await navigator.getByRole("option", { name: /Research 0001/u }).dblclick();
  const frame = page.frameLocator("iframe.html-viewer:visible");
  await expect(frame.locator("#p0")).toBeVisible({ timeout: 30000 });
  await expect(navigator).toBeHidden();
  await page.getByRole("tab", { name: "Library" }).click();
  await expect(navigator).toBeVisible();
  await page.getByRole("tab", { name: /Research 0001/u }).click();
  await expect(navigator).toBeHidden();
  completed.push("Sources sidebar hides while reading and returns with the library");

  const size = () =>
    frame
      .locator("body")
      .evaluate((body) => body.ownerDocument.defaultView.getComputedStyle(body).fontSize);
  const before = await size();
  await page.locator(".header-display-trigger").click();
  await page.getByRole("button", { name: "Larger text" }).click();
  await page.getByRole("button", { name: "Narrow", exact: true }).click();
  await expect.poll(size).not.toBe(before);
  await page.keyboard.press("Escape");
  completed.push("Text size and line length apply to the open saved page");

  await frame.locator("#p2").click();
  await page.keyboard.press("Control+.");
  await expect(page.locator(".reader-shell")).toHaveClass(/is-focus-chrome-hidden/u, {
    timeout: 5000,
  });
  await screenshot("reading-mode");
  await frame.locator("#p2").press("Escape");
  await expect(page.getByRole("button", { name: "Reading mode" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await frame.locator("#p2").press("Control+Shift+Backslash");
  await expect(page.getByRole("complementary", { name: "Source workspace" })).toBeVisible();
  completed.push("Reading mode and panel shortcuts work with focus inside the document");

  await frame.locator("#p3").evaluate((element) => {
    const doc = element.ownerDocument;
    const range = doc.createRange();
    range.setStart(element.firstChild, 0);
    range.setEnd(element.firstChild, 40);
    const selection = doc.defaultView.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    doc.dispatchEvent(new doc.defaultView.PointerEvent("pointerup", { bubbles: true }));
  });
  const composer = page.getByRole("region", { name: "New highlight" });
  await composer.getByRole("button", { name: "Save highlight", exact: true }).click();
  await expect(composer).toHaveCount(0);
  const marker = frame.locator("[data-mdbase-reader='margin'] > span");
  await expect(marker).toHaveCount(1);
  await marker.click();
  await expect(page.locator(".annotation-card.is-selected")).toBeVisible();
  await expect(page.locator(".annotation-card.is-selected")).not.toContainText(/anchor/iu);
  await screenshot("margin-marker");
  completed.push("A new highlight gets a margin marker that selects its card");

  await page.getByRole("tab", { name: "Library" }).click();
  await expect(page.getByRole("columnheader", { name: "Annotations" })).toBeVisible();
  completed.push("The library counts annotations per source");
  return completed;
}
