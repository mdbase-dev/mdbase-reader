import { expect } from "@playwright/test";
import { auditAnnotationWorkbench } from "./audit-annotation-workbench.mjs";
import { auditAnnotationFormats } from "./audit-annotation-formats.mjs";
import { auditAnnotationNavigationFailure } from "./audit-annotation-navigation.mjs";
import { chooseOption } from "./audit-select.mjs";

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
      // Keep the sidebar open while reading, as the docking checks below expect.
      localStorage.setItem(
        "mdbase-reader:shell:v1:test-reader-audit",
        JSON.stringify({ sidebarWhileReading: "keep" }),
      );
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
  await expect(composer.getByRole("textbox", { name: "Comment" })).toHaveCount(0);
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
  await expect(tools.locator(".annotation-card.is-selected")).toHaveCSS("box-shadow", "none");
  await expect(tools.getByRole("textbox", { name: "Comment" })).toHaveCount(0);
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
  const editor = tools.getByRole("textbox", { name: "Comment" });
  const editText = "[test] A recoverable annotation comment.";
  blockWrites(true);
  await editor.fill(editText);
  await expect(tools.getByRole("alert")).toContainText("offline");
  await expect(editor).toHaveValue(/recoverable annotation comment/u);
  await screenshot("annotation-failed-save");
  blockWrites(false);
  await editor.press("Control+s");
  await expect(tools.getByRole("textbox", { name: "Comment" })).toHaveCount(0);
  await page.reload();
  await expect(tools).toContainText("recoverable annotation comment");
  await tools.getByRole("button", { name: "Edit", exact: true }).first().click();
  const quote = tools.getByRole("textbox", { name: "Quoted passage" });
  await quote.fill("[test] A corrected quotation.");
  await expect(tools.getByText("Edited from the document text.")).toBeVisible();
  await screenshot("annotation-quote-corrected");
  await quote.press("Control+s");
  await expect(quote).toHaveCount(0);
  await page.reload();
  await expect(tools.locator("blockquote").first()).toHaveText("[test] A corrected quotation.");
  await expect(tools).toContainText("recoverable annotation comment");
  completed.push(
    "Annotation autosave failures retain text in memory; keyboard retry persists it across reload",
  );

  await select(1);
  await composer.getByRole("button", { name: "Add a comment" }).click();
  await composer
    .getByRole("textbox", { name: "Comment" })
    .fill("[test] New selection draft survives switching sources.");
  await expect(
    composer.getByText("Not saved yet — keep Reader open until you save this annotation.", {
      exact: true,
    }),
  ).toBeVisible();
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => void dialog.dismiss());
  await select(2);
  await expect(composer.getByRole("textbox", { name: "Comment" })).toHaveValue(
    /New selection draft survives/u,
  );
  await composer.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(composer).toBeVisible();
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => void dialog.accept());
  await open(1);
  await open(0);
  await expect(composer.getByRole("textbox", { name: "Comment" })).toHaveValue(
    /New selection draft survives/u,
  );
  await composer.getByRole("textbox", { name: "Comment" }).press("Control+s");
  await expect(composer).toHaveCount(0);
  completed.push(
    "New comments remain in memory across source switching; replacing or discarding them requires confirmation",
  );

  await tools.getByRole("searchbox", { name: "Search annotations" }).fill("recoverable");
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  await tools.getByRole("searchbox", { name: "Search annotations" }).fill("no such quotation");
  await expect(tools.getByText("No matching annotations", { exact: true })).toBeVisible();
  await tools.getByRole("button", { name: "Clear filters", exact: true }).click();
  await tools.getByLabel("Filter and sort annotations", { exact: true }).click();
  await chooseOption(tools.getByRole("combobox", { name: "Filter annotations" }), "comments");
  await expect(tools.locator(".annotation-card")).toHaveCount(2);
  await chooseOption(tools.getByRole("combobox", { name: "Sort annotations" }), "newest");
  await screenshot("annotation-browsing-desktop");
  await tools.getByRole("button", { name: "Show in document" }).first().click();
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
    await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await expect(tools.getByRole("searchbox", { name: "Search annotations" })).toBeVisible();
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  ).toBe(true);
  await screenshot("annotation-mobile-inspector");
  await tools.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(tools.getByRole("textbox", { name: "Comment" })).toBeVisible();
  const saveRect = await tools.getByRole("button", { name: "Done", exact: true }).boundingBox();
  expect(saveRect.y + saveRect.height).toBeLessThanOrEqual(844);
  await screenshot("annotation-mobile-edit");
  await tools.getByRole("textbox", { name: "Comment" }).press("Escape");
  await expect(tools.getByRole("textbox", { name: "Comment" })).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await expect(page.locator("iframe.html-viewer:visible")).toHaveCount(1);
  completed.push("Annotation inspector remains usable without horizontal overflow at 390px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Start cross-format checks with the standard arrangement, independently of the stress layout.
  await page.locator(".reader-dock-tab:not(.is-side)").first().click({ button: "right" });
  await page.getByText("Reset pane arrangement (keep tabs)", { exact: true }).click();
  completed.push(...(await auditAnnotationFormats(page, { open, screenshot })));
  completed.push(...(await auditAnnotationNavigationFailure(page, { open, screenshot })));
  completed.push(await auditAnnotationOverview(page, screenshot));
  return completed;
}

/** The library's annotations view lists annotations across sources and opens one in place. */
async function auditAnnotationOverview(page, screenshot) {
  await page.getByRole("tab", { name: "Library" }).click();
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  const grid = page.getByRole("grid", { name: "Annotations" });
  const rows = grid.locator(".library-table-body .library-table-row");
  await expect.poll(() => rows.count()).toBeGreaterThan(1);
  await auditAnnotationColumns(page, grid);
  await page.getByRole("textbox", { name: "Search annotations" }).fill("Patient attention and");
  await expect(rows.filter({ hasText: "Research 0021" }).first()).toBeVisible();
  await auditAnnotationViewSaving(page, grid, rows);
  await screenshot("annotation-overview");
  await rows.filter({ hasText: "Research 0021" }).first().dblclick();
  await expect(page.locator(".document-session.is-active .epub-viewer")).toBeVisible({
    timeout: 60000,
  });
  return "Library annotations view sorts, resizes, hides and saves columns, and opens an annotation";
}

/** Headers sort, resize from the keyboard, and hide or restore columns, as in the sources table. */
async function auditAnnotationColumns(page, grid) {
  const sourceHeader = grid.getByRole("columnheader").filter({ hasText: /^Source/ });
  await grid.getByRole("button", { name: "Source", exact: true }).click();
  await expect(sourceHeader).toHaveAttribute("aria-sort", "ascending");
  const resizer = grid.getByRole("separator", { name: "Resize Source column" });
  const before = Number(await resizer.getAttribute("aria-valuenow"));
  await resizer.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(resizer).toHaveAttribute("aria-valuenow", String(before + 32));
  const headers = grid.getByRole("columnheader");
  const count = await headers.count();
  await grid.getByLabel("Type column options").click();
  await page.getByRole("button", { name: "Hide column" }).click();
  await expect(headers).toHaveCount(count - 1);
  await grid.getByLabel("Add column").click();
  await page.getByRole("button", { name: "Type", exact: true }).click();
  await expect(headers).toHaveCount(count);
}

/** A filtered annotations view saves as an mdbase view and reopens in annotations mode. */
async function auditAnnotationViewSaving(page, grid, rows) {
  const options = page.getByLabel(/^Annotation view options/);
  await options.click();
  await page.getByRole("button", { name: "Add “Annotations for this source” view" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added views/" })).toBeVisible();
  await page.getByRole("button", { name: "Save as new view…" }).click();
  const dialog = page.getByRole("form", { name: "Save library view" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("[test] Attention quotes");
  await dialog.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("combobox", { name: "Library view" })).toHaveText(
    "[test] Attention quotes",
  );
  await expect(grid).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search annotations" })).toHaveValue(
    "Patient attention and",
  );
  await expect(rows.filter({ hasText: "Research 0021" }).first()).toBeVisible();
  await expect(grid.getByRole("columnheader").filter({ hasText: /^Source/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
}
