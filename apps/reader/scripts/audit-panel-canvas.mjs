import { expect } from "@playwright/test";

const storageKey = "mdbase-reader:panels:v1:test-reader-audit";

/**
 * Side regions as ordinary panes, tabs that follow the active document, and the canvas. Runs
 * after the panel workspace audit, which leaves every tab in one pane.
 */
export async function auditPanelCanvas(page, { screenshot }) {
  const completed = [];
  // An action that cannot happen fails here, rather than waiting for ever.
  page.setDefaultTimeout(30000);
  const name = (number) => `[test] Research ${String(number).padStart(4, "0")}`;
  const tabs = page.locator(".reader-dock-tab:not(.is-side)");
  const tab = (title) =>
    tabs.filter({
      has: page.locator(".reader-tab-title", { hasText: new RegExp(`^${escape(title)}$`) }),
    });
  const panel = (id) => page.locator(`.reader-dock-tab[data-panel-id="${id}"]`);
  const menu = async (target, label) => {
    await target.click({ button: "right" });
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  const region = (side) => page.locator(`.mp-stack[data-mp-edge="${side}"]`);
  const panes = page.locator(".mp-stack:not([data-mp-edge])");
  const sourcesButton = page.getByRole("button", { name: "Toggle Sources sidebar" });
  const notesButton = page.getByRole("button", { name: "Toggle Notes panel" });
  const saved = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)).workspace.workspace, storageKey);
  const wanted = async () => {
    await page.waitForTimeout(400);
    const { edges } = await saved();
    return { left: edges.left?.visible, right: edges.right?.visible };
  };
  const drag = async (target, point) => {
    const rect = await target.boundingBox();
    if (!rect) throw new Error("Drag source is not visible");
    const start = { x: rect.x + Math.min(rect.width / 2, 40), y: rect.y + rect.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y + 6, { steps: 4 });
    await page.mouse.move(point.x, point.y, { steps: 20 });
    await page.waitForTimeout(150);
    await page.mouse.up();
  };

  // --- Side regions
  await expect(region("left")).toBeVisible();
  await notesButton.click();
  await expect(region("right")).toBeVisible();
  await page.setViewportSize({ width: 900, height: 1000 });
  // Notes was asked for last, so Sources is the one that gives way.
  await expect(region("right")).toBeVisible();
  await expect(region("left")).toBeHidden();
  await sourcesButton.click();
  await expect(region("left")).toBeVisible();
  await expect(region("right")).toBeHidden();
  expect(await wanted()).toEqual({ left: true, right: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(region("left")).toBeVisible();
  await expect(region("right")).toBeVisible();
  completed.push("A side that gives way for room is still wanted, and returns when there is room");

  const sourcesTab = panel("reader:navigator");
  const strip = await panes.first().locator(".mp-tabs").boundingBox();
  await drag(sourcesTab, { x: strip.x + strip.width - 20, y: strip.y + strip.height / 2 });
  await expect(region("left")).toHaveCount(0);
  await expect(
    panes.first().locator('.reader-dock-tab[data-panel-id="reader:navigator"]'),
  ).toHaveCount(1);
  await expect(sourcesButton).toHaveAttribute("aria-expanded", "false");
  await screenshot("workspace-sources-in-pane");
  await sourcesButton.click();
  await expect(region("left")).toBeVisible();
  await expect(
    region("left").locator('.reader-dock-tab[data-panel-id="reader:navigator"]'),
  ).toHaveCount(1);
  expect((await region("left").boundingBox()).x).toBe(0);
  completed.push("Sources moves into a pane like any tab, and its button brings it home");

  await notesButton.click();
  await expect(region("right")).toBeHidden();
  expect(await wanted()).toEqual({ left: true, right: false });

  // --- Following the active document
  await tab(name(0)).click();
  await page.getByRole("button", { name: /^Search and commands/u }).click();
  await page
    .getByRole("combobox", { name: "Search sources and commands", exact: true })
    .fill("Open source note");
  await page.getByRole("option", { name: /^Open source note/u }).click();
  const noteTab = tabs.filter({ hasText: "Source note" });
  await expect(noteTab).toHaveCount(1);
  const note = await noteTab.getAttribute("data-panel-id");
  await menu(panel(note), "Follow the active document");
  await expect(panel(note).locator(".dock-tab-marker.is-following")).toBeVisible();
  await menu(panel(note), "Move to new pane right");
  await expect(panes).toHaveCount(2);
  await expect(panel(note)).toContainText(name(0));
  await tab(name(1)).click();
  await expect(panel(note)).toContainText(name(1));
  await screenshot("workspace-following");
  await menu(panel(note), "Pin tab");
  await tab(name(2)).click();
  await expect(panel(note)).toContainText(name(1));
  await menu(panel(note), "Unpin tab");
  await expect(panel(note)).toContainText(name(2));
  // Working in the following tab does not change which document it follows.
  await page.locator(`[data-mp-panel="${note}"]`).click();
  await expect(panel(note)).toContainText(name(2));
  completed.push(
    "A note tab follows the active document, holds still while pinned, and catches up",
  );

  // --- The canvas
  const boxes = async () => {
    const all = [];
    for (const pane of await panes.all()) {
      all.push(await pane.boundingBox());
    }
    return all;
  };
  const root = page.locator("[data-mp-view]");
  await menu(tab(name(2)), "Fit panes to the window");
  await page.waitForTimeout(400);
  const tiled = await boxes();
  await menu(tab(name(2)), "Arrange panes on a canvas");
  await expect(root).toHaveAttribute("data-mp-view", "canvas");
  await page.waitForTimeout(400);
  const placed = await boxes();
  placed.forEach((box, index) => {
    expect(Math.abs(box.x - tiled[index].x)).toBeLessThan(12);
    expect(Math.abs(box.y - tiled[index].y)).toBeLessThan(12);
    expect(Math.abs(box.width - tiled[index].width)).toBeLessThan(24);
  });
  await screenshot("workspace-canvas");
  completed.push("Switching to the canvas leaves every pane where it was");

  const zoom = () => page.locator(".mp-zoom span").innerText();
  const ground = placed[0];
  await page.mouse.move(ground.x + ground.width / 2, ground.y + ground.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 400);
  await page.keyboard.up("Control");
  await expect.poll(async () => Number.parseInt(await zoom(), 10)).toBeLessThan(100);
  const small = await boxes();
  expect(small[0].width).toBeLessThan(placed[0].width);
  await screenshot("workspace-canvas-zoomed-out");
  // Zoomed, even the pane in use is a picture to arrange; a double click brings it back to work.
  const cover = page.locator(".mp-cover[data-mp-focused]");
  await expect(cover).toBeVisible();
  await cover.dblclick();
  await expect.poll(zoom).toBe("100%");
  await expect(cover).toBeHidden();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect.poll(zoom).toBe("80%");
  await expect(cover).toBeVisible();
  await page.getByRole("button", { name: "Actual size" }).click();
  await expect.poll(zoom).toBe("100%");
  completed.push("Zooming the canvas scales every pane, which is live again at actual size");

  const grip = panes.last().locator(".mp-grip");
  const before = (await boxes()).at(-1);
  const hold = await grip.boundingBox();
  await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
  await page.mouse.down();
  await page.mouse.move(hold.x + 150, hold.y + 220, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await boxes()).at(-1).y).toBeGreaterThan(before.y + 150);

  // A document on the canvas is worked in as anywhere else: a selection's toolbar sits beside
  // the passage, wherever the pane has been moved to.
  await tab(name(2)).click();
  const frame = page.locator("iframe.html-viewer:visible");
  const paragraph = frame.contentFrame().locator("p").first();
  await expect(paragraph).toBeVisible({ timeout: 30000 });
  const frameBox = await frame.boundingBox();
  // Selected as the other audits do it: a pointer drag inside a document frame never returns
  // in headless Chromium.
  const passage = await paragraph.evaluate((element) => {
    const doc = element.ownerDocument;
    const range = doc.createRange();
    range.setStart(element.firstChild, 0);
    range.setEnd(element.firstChild, 30);
    const selection = doc.defaultView.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    doc.dispatchEvent(new doc.defaultView.PointerEvent("pointerup", { bubbles: true }));
    const box = range.getBoundingClientRect();
    return { x1: box.left, x2: box.right, top: box.top };
  });
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(bar).toBeVisible({ timeout: 15000 });
  const barBox = await bar.boundingBox();
  const middle = frameBox.x + (passage.x1 + passage.x2) / 2;
  expect(Math.abs(barBox.x + barBox.width / 2 - middle)).toBeLessThan(barBox.width / 2);
  expect(Math.abs(barBox.y + barBox.height - (frameBox.y + passage.top))).toBeLessThan(40);
  await screenshot("workspace-canvas-selection");
  await bar.getByRole("button", { name: /^Highlight Yellow\b/u }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator(".annotation-compose-error")).toHaveCount(0);
  completed.push("A passage selected in a pane on the canvas gets its toolbar beside it");

  await menu(tab(name(2)), "Open beside");
  await expect(panes).toHaveCount(3);
  await page.getByRole("button", { name: "Show every pane" }).click();
  await page.waitForTimeout(500);
  for (const pane of await panes.all()) {
    await expect(pane).toBeInViewport({ ratio: 0.9 });
  }
  await screenshot("workspace-canvas-arranged");
  completed.push("Panes move freely on the canvas and all fit in view on request");

  await page.waitForTimeout(400);
  const stored = await saved();
  expect(stored.view).toBe("canvas");
  expect(Object.keys(stored.canvas.frames)).toHaveLength(3);
  await page.reload();
  await expect(panes).toHaveCount(3, { timeout: 30000 });
  await expect(root).toHaveAttribute("data-mp-view", "canvas");
  await expect(panel(note).locator(".dock-tab-marker.is-following")).toBeVisible();
  completed.push("The canvas, its panes and the following tab survive a reload");

  await menu(tab(name(2)).first(), "Fit panes to the window");
  await expect(root).toHaveAttribute("data-mp-view", "tiling");
  await menu(tab(name(2)).first(), "Reset pane arrangement (keep tabs)");
  await expect(panes).toHaveCount(1);
  return completed;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
