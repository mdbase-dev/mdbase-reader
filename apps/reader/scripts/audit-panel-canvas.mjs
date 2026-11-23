import { expect } from "@playwright/test";

const storageKey = "mdbase-reader:workspace:v2:test-reader-audit";

/**
 * Library views as tabs, side regions as ordinary panes, the Notes tabs that follow the active
 * document, and the canvas. Runs after the panel workspace audit, which leaves every tab in one
 * pane.
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
  /** What is kept: the arrangement every window shares, and this window's view of it. */
  const saved = () =>
    page.evaluate(
      (key) => ({
        arrangement: JSON.parse(localStorage.getItem(key)).arrangement,
        window: JSON.parse(sessionStorage.getItem(`${key}:window`)).window,
      }),
      storageKey,
    );
  const wanted = async () => {
    await page.waitForTimeout(400);
    const { shown } = (await saved()).window;
    return { left: shown.left, right: shown.right };
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
  // The Notes pane is the one in use, so the document's pane is the one to pick below.
  await panel(note).click();
  const ground = placed[0];
  await page.mouse.move(ground.x + ground.width / 2, ground.y + ground.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 400);
  await page.keyboard.up("Control");
  await expect.poll(async () => Number.parseInt(await zoom(), 10)).toBeLessThan(100);
  const small = await boxes();
  expect(small[0].width).toBeLessThan(placed[0].width);
  await screenshot("workspace-canvas-zoomed-out");
  // Zoomed, the pane in use is still live. One that is not in use is a picture to arrange, and
  // a double click brings it to actual size to work in.
  const cover = page.locator(".mp-cover[data-mp-focused]");
  await expect(cover).toBeHidden();
  // The Notes pane is simply shown smaller, and still answers a click.
  const notesPane = page.locator(`.reader-dock-sidebar[data-panel-id="${note}"]`);
  const shown = Number.parseInt(await zoom(), 10) / 100;
  expect(
    await notesPane.evaluate(
      (element) => element.getBoundingClientRect().width / element.offsetWidth,
    ),
  ).toBeCloseTo(shown, 1);
  await notesPane.click();
  await expect(showing(note)).toContainText(name(2));
  await expect(page.locator(".mp-cover:not([data-mp-focused])")).toHaveCount(1);
  await page.locator(".mp-cover:not([data-mp-focused])").dblclick();
  await expect.poll(zoom).toBe("100%");
  await expect(cover).toBeHidden();
  completed.push(
    "Zooming the canvas scales every pane, and a double click returns one to actual size",
  );

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
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  const highlight = async (index, shot) => {
    const paragraph = frame.contentFrame().locator("p").nth(index);
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
    await expect(bar).toBeVisible({ timeout: 15000 });
    const barBox = await bar.boundingBox();
    const middle = frameBox.x + (passage.x1 + passage.x2) / 2;
    expect(Math.abs(barBox.x + barBox.width / 2 - middle)).toBeLessThan(barBox.width / 2);
    expect(Math.abs(barBox.y + barBox.height - (frameBox.y + passage.top))).toBeLessThan(40);
    await screenshot(shot);
    await bar.getByRole("button", { name: /^Highlight Yellow\b/u }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.locator(".annotation-compose-error")).toHaveCount(0);
  };
  await highlight(0, "workspace-canvas-selection");
  completed.push("A passage selected in a pane on the canvas gets its toolbar beside it");

  // The same at another zoom. The document draws itself at the zoom, so nothing scales it and a
  // selection still measures true.
  const scaleOf = (locator) =>
    locator.evaluate((element) => element.getBoundingClientRect().width / element.offsetWidth);
  const documentBody = page.locator(".mp-panel[data-mp-native]:visible .mp-panel-body");
  /** The zoom a saved page is drawn at inside its own frame. */
  const pageZoom = () =>
    frame
      .contentFrame()
      .locator("html")
      .evaluate((element) =>
        Number(element.ownerDocument.defaultView.getComputedStyle(element).zoom),
      );
  const fullWidth = (await frame.boundingBox()).width;
  // Zoomed in, so that the pane stays wide enough for the toolbar to sit beside the passage (in
  // a narrow pane it docks at the foot, at any zoom).
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(zoom).toBe("125%");
  await expect(cover).toBeHidden();
  await expect.poll(() => scaleOf(documentBody)).toBeCloseTo(1, 2);
  await expect.poll(async () => (await frame.boundingBox()).width / fullWidth).toBeCloseTo(1.25, 1);
  await expect.poll(pageZoom).toBeCloseTo(1.25, 2);
  await highlight(1, "workspace-canvas-zoomed-selection");
  await page.getByRole("button", { name: "Actual size" }).click();
  await expect.poll(zoom).toBe("100%");
  await expect.poll(pageZoom).toBe(1);
  completed.push("A zoomed canvas keeps the pane in use live: a document draws itself at the zoom");

  // The other formats draw themselves at the zoom too: a PDF page fits its pane, and an EPUB's
  // text is set larger. The viewer's own controls keep their size.
  const openSource = async (number) => {
    await page.getByRole("button", { name: /^Search and commands/u }).click();
    await page
      .getByRole("combobox", { name: "Search sources and commands", exact: true })
      .fill(name(number).slice("[test] ".length));
    await page.getByRole("option", { name: new RegExp(`^${escape(name(number))}`, "u") }).click();
    await expect(page.locator(".mdbase-command-palette")).toBeHidden();
  };
  const canvasZoom = (label) => page.locator(".mp-zoom").getByRole("button", { name: label });
  await openSource(20);
  const pdf = page.locator(".document-session.is-active .pdf-viewer");
  await expect(pdf).toBeVisible({ timeout: 60000 });
  const pdfPage = pdf.locator("img").first();
  await expect
    .poll(() => pdfPage.evaluate((image) => image.complete && image.naturalWidth > 100), {
      timeout: 30000,
    })
    .toBe(true);
  const pageWidth = (await pdfPage.boundingBox()).width;
  await canvasZoom("Zoom in").click();
  await expect.poll(zoom).toBe("125%");
  await expect
    .poll(async () => (await pdfPage.boundingBox()).width / pageWidth, { timeout: 15000 })
    .toBeCloseTo(1.25, 1);
  const sheet = await pdfPage.boundingBox();
  await page.mouse.move(sheet.x + 70 * 1.25, sheet.y + 75 * 1.25);
  await page.mouse.down();
  await page.mouse.move(sheet.x + 300 * 1.25, sheet.y + 78 * 1.25, { steps: 20 });
  await page.mouse.up();
  await expect(bar).toBeVisible({ timeout: 15000 });
  await screenshot("workspace-canvas-zoomed-pdf");
  await bar.getByRole("button", { name: /^Highlight Yellow\b/u }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator(".annotation-compose-error")).toHaveCount(0);
  await canvasZoom("Actual size").click();
  await expect.poll(zoom).toBe("100%");

  await openSource(21);
  const epub = page.locator(".document-session.is-active .epub-viewer");
  await expect(epub).toBeVisible({ timeout: 60000 });
  const epubLine = epub
    .locator("iframe.readium-navigator-iframe")
    .first()
    .contentFrame()
    .locator("p")
    .first();
  await expect(epubLine).toBeVisible({ timeout: 30000 });
  const lineHeight = (await epubLine.boundingBox()).height;
  await canvasZoom("Zoom in").click();
  await expect.poll(zoom).toBe("125%");
  await expect
    .poll(async () => (await epubLine.boundingBox()).height / lineHeight, { timeout: 15000 })
    .toBeCloseTo(1.25, 1);
  await screenshot("workspace-canvas-zoomed-epub");
  await canvasZoom("Actual size").click();
  await expect.poll(zoom).toBe("100%");
  await menu(tab(name(21)), "Close");
  await menu(tab(name(20)), "Close");
  await tab(name(2)).click();
  completed.push("A PDF and an EPUB on a zoomed canvas draw at the zoom and can be worked in");

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
  const stored = (await saved()).arrangement;
  expect(stored.view).toBe("canvas");
  expect(Object.keys(stored.frames)).toHaveLength(3);
  await page.reload();
  await expect(panes).toHaveCount(3, { timeout: 30000 });
  await expect(root).toHaveAttribute("data-mp-view", "canvas");
  await expect(panel(note)).toHaveClass(/is-side/u);
  completed.push("The canvas, its panes and the Notes tab in a pane survive a reload");

  await menu(tab(name(2)).first(), "Fit panes to the window");
  await expect(root).toHaveAttribute("data-mp-view", "tiling");
  await menu(tab(name(2)).first(), "Reset pane arrangement (keep tabs)");
  await expect(panes).toHaveCount(1);

  // --- A second window on the same collection shares the arrangement, not what is in front
  await page.waitForTimeout(400);
  const other = await page.context().newPage();
  await other.goto(page.url());
  const otherTabs = other.locator(".reader-dock-tab:not(.is-side)");
  const otherPanes = other.locator(".mp-stack:not([data-mp-edge])");
  await expect(otherTabs).toHaveCount(await tabs.count(), { timeout: 30000 });
  await expect(otherPanes).toHaveCount(1);
  const theirs = await tab(name(0)).first().getAttribute("data-panel-id");
  const inFront = other.locator(`.mp-tab[data-mp-tab="${theirs}"]`);
  await inFront.click();
  await expect(inFront).toHaveAttribute("aria-selected", "true");
  await page.bringToFront();
  await menu(tab(name(2)).first(), "Move to new pane right");
  await expect(panes).toHaveCount(2);
  await expect(otherPanes).toHaveCount(2, { timeout: 15000 });
  await expect(inFront).toHaveAttribute("aria-selected", "true");
  await other.close();
  await menu(tab(name(2)).first(), "Reset pane arrangement (keep tabs)");
  await expect(panes).toHaveCount(1);
  completed.push("Two windows on a collection share its panes and tabs, each on its own tab");
  return completed;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
