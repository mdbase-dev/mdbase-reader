import { expect } from "@playwright/test";
import { auditAnnotationWorkbench } from "./audit-annotation-workbench.mjs";
import { auditAnnotationFormats } from "./audit-annotation-formats.mjs";
import { auditAnnotationNavigationFailure } from "./audit-annotation-navigation.mjs";

export async function auditAnnotations(page, { screenshot, blockWrites }) {
  const completed = [];
  blockWrites(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    if (
      globalThis.location.hash === "#annotation-audit-reset" &&
      globalThis.window.name !== "annotation-reset-done"
    ) {
      globalThis.window.name = "annotation-reset-done";
      localStorage.clear();
      globalThis.history.replaceState(null, "", globalThis.location.pathname);
    }
  });
  const entry = new URL("/test-fixtures/audit-reader.html#annotation-audit-reset", page.url()).href;
  await page.goto("about:blank");
  await page.goto(entry);
  const open = async (number) => {
    const title = `Research ${String(number).padStart(4, "0")}`;
    await page.getByRole("textbox", { name: "Find a source by title, author or tag" }).fill(title);
    await page.getByRole("option", { name: new RegExp(title) }).dblclick();
  };
  await open(0);
  const frame = () => page.frameLocator("iframe.html-viewer:visible");
  const select = async (paragraph = 0) => {
    const target = frame().locator(`#p${paragraph}`);
    await target.scrollIntoViewIfNeeded();
    await target.evaluate((element) => {
      const doc = element.ownerDocument;
      const range = doc.createRange();
      range.setStart(element.firstChild, 0);
      range.setEnd(element.firstChild, 57);
      const selection = doc.defaultView.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      doc.dispatchEvent(new doc.defaultView.PointerEvent("pointerup", { bubbles: true }));
    });
  };
  await select();
  const composer = page.getByRole("region", { name: "New highlight" });
  await expect(composer).toBeVisible();
  await expect(composer.getByRole("textbox", { name: "Annotation note" })).toHaveCount(0);
  await screenshot("annotation-compact-highlight");
  await composer.getByRole("button", { name: "Save highlight", exact: true }).focus();
  await page.keyboard.press("Control+s");
  await expect(composer).toHaveCount(0);
  const navigatorWidth = (
    await page.getByRole("complementary", { name: "Library navigator" }).boundingBox()
  ).width;
  await frame()
    .locator("#p0")
    .click({ position: { x: 20, y: 10 } });
  const tools = page.getByRole("complementary", { name: "Source workspace" });
  await expect(tools.locator(".annotation-card.is-selected")).toBeVisible();
  await expect(tools.getByRole("textbox", { name: "Annotation note" })).toHaveCount(0);
  await expect(page.locator("iframe.html-viewer:visible")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.getByRole("complementary", { name: "Library navigator" }).boundingBox()).width,
    )
    .toBeCloseTo(navigatorWidth, 0);
  await screenshot("annotation-selected-not-editing");
  completed.push(
    "Compact highlight saves by keyboard; clicking the highlight reveals its card without entering edit mode",
  );

  await tools.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = tools.getByRole("textbox", { name: "Annotation note" });
  const editText =
    "> A durable reading library makes patient attention possible.\n\n[test] A recoverable annotation comment.";
  await editor.fill(editText);
  await expect(tools.getByText("Draft saved on this device", { exact: true })).toBeVisible();
  await page.reload();
  await tools.getByRole("button", { name: "Resume edit", exact: true }).click();
  await expect(editor).toContainText("recoverable annotation comment");
  blockWrites(true);
  await editor.press("Control+s");
  await expect(tools.getByRole("alert")).toContainText("offline");
  await expect(editor).toContainText("recoverable annotation comment");
  await screenshot("annotation-failed-save");
  blockWrites(false);
  await editor.press("Control+s");
  await expect(tools.getByRole("textbox", { name: "Annotation note" })).toHaveCount(0);
  await page.reload();
  await expect(tools).toContainText("recoverable annotation comment");
  completed.push(
    "Annotation edits recover after reload, survive failed saves, and persist through keyboard retry",
  );

  await select(1);
  await composer.getByRole("button", { name: "Add a comment" }).click();
  await composer
    .getByRole("textbox", { name: "Annotation note" })
    .fill("[test] New selection draft survives switching sources.");
  await expect(composer.getByText("Draft saved on this device", { exact: true })).toBeVisible();
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => void dialog.dismiss());
  await select(2);
  await expect(composer).toContainText("New selection draft survives");
  await composer.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(composer).toBeVisible();
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => void dialog.accept());
  await open(1);
  await open(0);
  await expect(composer).toContainText("New selection draft survives");
  await page.reload();
  await expect(composer).toContainText("New selection draft survives");
  await composer.getByRole("textbox", { name: "Annotation note" }).press("Control+s");
  await expect(composer).toHaveCount(0);
  completed.push(
    "New comments survive source switching and reload; replacing or discarding unfinished comments requires confirmation",
  );

  await tools.getByRole("searchbox", { name: "Search annotations" }).fill("recoverable");
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  await tools.getByRole("searchbox", { name: "Search annotations" }).fill("no such quotation");
  await expect(tools.getByText("No matching annotations", { exact: true })).toBeVisible();
  await tools.getByRole("button", { name: "Clear filters", exact: true }).click();
  await tools.getByRole("combobox", { name: "Filter annotations" }).selectOption("comments");
  await expect(tools.locator(".annotation-card")).toHaveCount(2);
  await tools.getByRole("combobox", { name: "Sort annotations" }).selectOption("newest");
  await screenshot("annotation-browsing-desktop");
  await tools.getByRole("button", { name: "Open annotation in document" }).first().click();
  await expect(page.getByRole("button", { name: "Back to reading position" })).toBeVisible();
  await page.getByRole("button", { name: "Back to reading position" }).click();
  await expect(page.getByRole("button", { name: "Back to reading position" })).toHaveCount(0);
  completed.push(
    "Local annotation search, comment filtering, sort controls, and return-to-reading work",
  );
  completed.push(...(await auditAnnotationWorkbench(page, { screenshot, open })));
  await expect(page.frameLocator("iframe.html-viewer:visible").locator("h1")).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await screenshot("annotation-dark-inspector");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
      ),
  );
  if (!(await tools.isVisible()))
    await page.getByRole("button", { name: "Toggle source tools" }).click();
  await expect(tools.getByRole("searchbox", { name: "Search annotations" })).toBeVisible();
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  ).toBe(true);
  await screenshot("annotation-mobile-inspector");
  await tools.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(tools.getByRole("textbox", { name: "Annotation note" })).toBeVisible();
  const saveRect = await tools
    .getByRole("button", { name: "Save changes", exact: true })
    .boundingBox();
  expect(saveRect.y + saveRect.height).toBeLessThanOrEqual(844);
  await screenshot("annotation-mobile-edit");
  await tools.getByRole("textbox", { name: "Annotation note" }).press("Escape");
  await expect(tools.getByRole("textbox", { name: "Annotation note" })).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle source tools" }).click();
  await expect(page.locator("iframe.html-viewer:visible")).toHaveCount(1);
  completed.push("Annotation inspector remains usable without horizontal overflow at 390px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Start cross-format checks with the standard arrangement, independently of the stress layout.
  await page.locator(".reader-dock-tab").first().click({ button: "right" });
  await page.getByText("Reset pane arrangement (keep tabs)", { exact: true }).click();
  completed.push(...(await auditAnnotationFormats(page, { open, screenshot })));
  completed.push(...(await auditAnnotationNavigationFailure(page, { open, screenshot })));
  return completed;
}
