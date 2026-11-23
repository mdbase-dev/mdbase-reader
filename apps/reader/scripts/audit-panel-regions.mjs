import { expect } from "@playwright/test";

const storageKey = "mdbase-reader:panels:v1:test-reader-audit";

/**
 * Library views as tabs, side regions as ordinary panes, the Notes tabs that follow the active
 * document or one pane, and a second window. Runs after the panel workspace audit, which leaves
 * every tab in one pane.
 */
export async function auditPanelRegions(page, { screenshot }) {
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
  /** What this window has saved: whether the reader wants each side open. */
  const wanted = async () => {
    await page.waitForTimeout(400);
    const { edges } = await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key)).workspace.workspace,
      storageKey,
    );
    return { left: edges.left.visible, right: edges.right.visible };
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

  // --- Library views as tabs
  await expect(region("left")).toBeVisible();
  const ids = (locator) =>
    locator.evaluateAll((elements) => elements.map((element) => element.dataset.panelId));
  const view = page.locator(".navigator-view-section > div > button").first();
  const viewName = (await view.locator("span").innerText()).trim();
  const tabCount = await tabs.count();
  const original = await ids(tab(viewName));
  await view.click({ modifiers: ["Control"] });
  await expect(tabs).toHaveCount(tabCount + 1);
  await expect(tab(viewName)).toHaveCount(original.length + 1);
  // A plain click goes to a tab that already shows the view.
  await view.click();
  await expect(tabs).toHaveCount(tabCount + 1);
  await menu(tab(viewName).last(), "Open beside");
  await expect(panes).toHaveCount(2);
  await expect(tab(viewName)).toHaveCount(original.length + 2);
  await screenshot("workspace-library-tabs");
  for (const id of (await ids(tab(viewName))).filter((id) => !original.includes(id))) {
    await menu(panel(id), "Close");
  }
  await expect(panes).toHaveCount(1);
  await expect(tabs).toHaveCount(tabCount);
  completed.push("A library view opens in a tab of its own, beside another, as often as wanted");

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

  // --- Notes: three tabs that show whichever document is being worked on
  const notesTab = (title) =>
    page.locator(".reader-dock-tab.is-side").filter({
      has: page.locator(".reader-tab-title", { hasText: new RegExp(`^${escape(title)}$`) }),
    });
  const showing = (id) =>
    page.locator(`.reader-dock-sidebar[data-panel-id="${id}"] .inspector-source`);
  await tab(name(0)).click();
  await notesButton.click();
  await expect(region("right")).toBeVisible();
  for (const title of ["Annotations", "Source note", "Citation"]) {
    await expect(region("right").locator(notesTab(title))).toHaveCount(1);
  }
  await notesTab("Source note").click();
  const note = await notesTab("Source note").getAttribute("data-panel-id");
  await expect(showing(note)).toContainText(name(0));
  await tab(name(1)).click();
  await expect(showing(note)).toContainText(name(1));
  await screenshot("workspace-notes-tabs");

  // Pinned, it is that source's own note tab, wherever it sits; unpinned, it follows again.
  await menu(panel(note), "Pin tab");
  await expect(panel(note)).not.toHaveClass(/is-side/u);
  await expect(panel(note).locator(".dock-tab-marker.is-pinned")).toBeVisible();
  await expect(panel(note)).toContainText(name(1));
  await tab(name(2)).click();
  await expect(panel(note)).toContainText(name(1));
  await screenshot("workspace-notes-pinned");
  await menu(panel(note), "Unpin tab");
  await expect(panel(note)).toHaveClass(/is-side/u);
  await expect(showing(note)).toContainText(name(2));

  // A source's own note tab can be told to follow, which makes it one more Notes panel.
  await page.getByRole("button", { name: /^Search and commands/u }).click();
  await page
    .getByRole("combobox", { name: "Search sources and commands", exact: true })
    .fill("Open source note");
  await page.getByRole("option", { name: /^Open source note/u }).click();
  const ownTab = tabs.filter({ hasText: "Source note" });
  await expect(ownTab).toHaveCount(1);
  const own = await ownTab.getAttribute("data-panel-id");
  await menu(panel(own), "Follow the active document");
  await expect(panel(own)).toHaveClass(/is-side/u);
  // The document it was about takes over as the one being worked on.
  await expect(showing(own)).toContainText(name(2));
  await expect(showing(note)).toContainText(name(2));
  await menu(panel(own), "Close");
  await expect(panel(own)).toHaveCount(0);

  // Like any tab it can leave its region, and it keeps following from wherever it is put.
  await menu(panel(note), "Move to new pane right");
  await expect(panes).toHaveCount(2);
  await tab(name(1)).click();
  await expect(showing(note)).toContainText(name(1));
  await tab(name(2)).click();
  await expect(showing(note)).toContainText(name(2));
  await screenshot("workspace-following");
  // Working in the panel does not change which document it shows.
  await page.locator(`.reader-dock-sidebar[data-panel-id="${note}"]`).click();
  await expect(showing(note)).toContainText(name(2));
  // Told to follow one pane, it stays with that pane's document while the reader works in
  // another, so two documents side by side can each have their notes.
  await menu(tab(name(1)), "Move to new pane right");
  await expect(panes).toHaveCount(3);
  await menu(panel(note), `Follow the pane showing ${name(1)}`);
  await expect(showing(note)).toContainText(name(1));
  await expect(panel(note)).toContainText(name(1));
  await tab(name(2)).click();
  await expect(showing(note)).toContainText(name(1));
  await screenshot("workspace-following-pane");
  await menu(panel(note), "Follow the active document");
  await expect(showing(note)).toContainText(name(2));
  await menu(panel(note), `Follow the pane showing ${name(1)}`);
  await expect(showing(note)).toContainText(name(1));
  // Its pane gone, it is about the document in use again.
  await menu(tab(name(1)), "Close");
  await expect(panes).toHaveCount(2);
  await tab(name(2)).click();
  await expect(showing(note)).toContainText(name(2));
  await notesButton.click();
  await expect(region("right")).toBeHidden();
  completed.push(
    "Notes are three tabs that follow the active document or one pane, hold a source while pinned, and move like any tab",
  );

  // The Notes tab is still in its pane, and still a Notes tab, after a reload.
  await page.waitForTimeout(400);
  await page.reload();
  await expect(panes).toHaveCount(2, { timeout: 30000 });
  await expect(panel(note)).toHaveClass(/is-side/u);
  await expect(panes.last().locator(`.reader-dock-tab[data-panel-id="${note}"]`)).toHaveCount(1);
  completed.push("A Notes tab moved into a pane survives a reload");

  await menu(tab(name(2)).first(), "Reset pane arrangement (keep tabs)");
  await expect(panes).toHaveCount(1);

  // --- A second window starts from this one's layout, and then each keeps its own
  await page.waitForTimeout(400);
  const other = await page.context().newPage();
  await other.goto(page.url());
  const otherTabs = other.locator(".reader-dock-tab:not(.is-side)");
  const otherPanes = other.locator(".mp-stack:not([data-mp-edge])");
  await expect(otherTabs).toHaveCount(await tabs.count(), { timeout: 30000 });
  await expect(otherPanes).toHaveCount(1);
  await page.bringToFront();
  await menu(tab(name(2)).first(), "Move to new pane right");
  await expect(panes).toHaveCount(2);
  await page.waitForTimeout(600);
  await expect(otherPanes).toHaveCount(1);
  await other.reload();
  await expect(otherTabs).toHaveCount(await tabs.count(), { timeout: 30000 });
  await expect(otherPanes).toHaveCount(1);
  await other.close();
  await menu(tab(name(2)).first(), "Reset pane arrangement (keep tabs)");
  await expect(panes).toHaveCount(1);
  completed.push("A second window starts from the layout saved last and then keeps its own");
  return completed;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
