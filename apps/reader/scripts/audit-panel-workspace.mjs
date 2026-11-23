import { expect } from "@playwright/test";

import { searchSources } from "./audit-source-search.mjs";

const storageKey = "mdbase-reader:workspace:v2:test-reader-audit";

/** Real pointer gestures against the panel workspace, not calls to its store. */
export async function auditPanelWorkspace(page, { screenshot }) {
  const completed = [];
  const name = (number) => `[test] Research ${String(number).padStart(4, "0")}`;
  const open = async (number) => {
    await searchSources(page, `Research ${String(number).padStart(4, "0")}`);
    await page
      .getByRole("option", {
        name: new RegExp(`^\\[test\\] Research ${String(number).padStart(4, "0")}`),
      })
      .click();
    await expect(page.locator(".mdbase-command-palette")).toBeHidden();
  };
  const tab = (title) =>
    page
      .locator(".reader-dock-tab:not(.is-side)")
      .filter({ has: page.locator(".reader-tab-title", { hasText: title }) });
  const menu = async (target, label) => {
    await target.click({ button: "right" });
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  const panes = page.locator(".mp-stack:not(:has(.reader-dock-tab.is-side))");
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  const frame = (id) => page.locator(`[data-session-id="${id}"] iframe.html-viewer`);
  const mark = (id, value) =>
    frame(id).evaluate((element, sentinel) => {
      element.contentWindow.__workspaceSentinel = sentinel;
    }, value);
  const marked = (id) => frame(id).evaluate((element) => element.contentWindow.__workspaceSentinel);
  const drag = async (target, point) => {
    const rect = await target.boundingBox();
    if (!rect) throw new Error("Drag source is not visible");
    const start = { x: rect.x + Math.min(rect.width / 2, 60), y: rect.y + rect.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y + 6, { steps: 4 });
    await page.mouse.move(point.x, point.y, { steps: 20 });
    await page.waitForTimeout(150);
    await page.mouse.up();
  };

  await open(0);
  await open(1);
  const first = await tab(name(0)).getAttribute("data-panel-id");
  const second = await tab(name(1)).getAttribute("data-panel-id");
  await expect(frame(second)).toBeVisible();
  await mark(second, "kept");
  await menu(tab(name(1)), "Move to new pane right");
  await expect(panes).toHaveCount(2);
  expect(await marked(second)).toBe("kept");
  completed.push("Moving a tab to a new pane keeps its document loaded");

  // The drop point is over another document's frame, which must not swallow the gesture.
  await tab(name(0)).click();
  await expect(frame(first)).toBeVisible();
  await mark(first, "dragged");
  const target = await frame(second).boundingBox();
  await drag(tab(name(0)), {
    x: target.x + target.width - 30,
    y: target.y + target.height / 2,
  });
  await expect(panes).toHaveCount(3);
  expect(await marked(first)).toBe("dragged");
  completed.push("Dragging a tab across a document splits the pane under the pointer");

  const before = await frame(first).boundingBox();
  const divider = page.locator('.mp-splitter[data-mp-direction="row"]').last();
  const handle = await divider.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 80, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await frame(first).boundingBox()).width).not.toBe(before.width);
  completed.push("Dragging a divider over documents resizes the panes beside it");

  // A new workspace scrolls its panes as columns once they no longer fit.
  const scroller = page.locator(".mp-scroller");
  const overflow = () => scroller.evaluate((element) => element.scrollWidth - element.clientWidth);
  await open(2);
  await menu(tab(name(2)), "Move to new pane right");
  await open(3);
  await menu(tab(name(3)), "Move to new pane right");
  await expect.poll(overflow).toBeGreaterThan(0);
  const sources = page.locator('.reader-dock-sidebar[data-panel-id="reader:navigator"]');
  await expect(sources).toBeVisible();
  expect((await sources.boundingBox()).x).toBe(0);
  await expect(tab(name(3))).toBeInViewport();
  await screenshot("workspace-columns");
  completed.push("Panes scroll as columns beside a pinned Sources panel");

  await menu(tab(name(3)), "Fit panes to the window");
  await expect.poll(overflow).toBe(0);
  await expect(tab(name(0))).toBeInViewport();
  await expect(tab(name(3))).toBeInViewport();
  completed.push("Fitting the panes to the window shows every pane without scrolling");

  await menu(tab(name(3)), "Undo arrangement change");
  await expect.poll(overflow).toBeGreaterThan(0);
  await expect(page.locator(".reader-dock-tab:not(.is-side)")).toHaveCount(5);
  completed.push("Undoing an arrangement change restores the layout and keeps every tab");

  await menu(tab(name(3)), "Show all tabs at once");
  // Five tabs, Sources and the three Notes panels.
  await expect(page.locator(".mp-card")).toHaveCount(9);
  await screenshot("workspace-overview");
  await page
    .locator(".mp-card")
    .filter({ hasText: name(0) })
    .locator(".mp-card-target")
    .click();
  await expect(page.locator(".mp-card")).toHaveCount(0);
  await expect(page.locator(`.mp-tab[data-mp-tab="${first}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(tab(name(0))).toBeInViewport();
  completed.push("The overview shows every tab and opens the one picked");

  await page.waitForTimeout(400);
  const stored = await saved();
  expect(stored.version).toBe(2);
  expect(JSON.stringify(stored)).not.toContain("dirty");
  await page.reload();
  await expect(panes).toHaveCount(5, { timeout: 30000 });
  await expect(page.locator(".reader-dock-tab:not(.is-side)")).toHaveCount(5);
  await expect(frame(first)).toBeVisible();
  completed.push("The arrangement and its tabs survive a reload");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.workspace-pane[aria-hidden="false"]')).toHaveCount(1);
  await page.keyboard.press("Control+Backslash");
  await expect(page.getByRole("complementary", { name: "Sources sidebar" })).toBeVisible();
  await expect(page.locator('.workspace-pane[aria-hidden="false"]')).toHaveCount(0);
  await page.keyboard.press("Control+Backslash");
  await expect(page.locator('.workspace-pane[aria-hidden="false"]')).toHaveCount(1);
  await screenshot("workspace-phone");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(panes).toHaveCount(5);
  await expect(frame(first)).toBeVisible();
  completed.push("A phone shows one pane at a time and the desktop arrangement returns intact");

  await menu(tab(name(0)), "Reset pane arrangement (keep tabs)");
  await expect(panes).toHaveCount(1);
  await expect(page.locator(".reader-dock-tab:not(.is-side)")).toHaveCount(5);
  completed.push("Resetting the arrangement gathers every tab into one pane");
  return completed;
}
