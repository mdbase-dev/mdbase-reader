import { expect } from "@playwright/test";
import { blockSourceDraftStorage } from "./audit-source-storage.mjs";

/** Real pointer gestures against the unified dock, not synthetic calls to its layout API. */
export async function auditDockview(page, { screenshot, blockWrites }) {
  const completed = [];
  const navigator = page.getByRole("textbox", { name: "Find a source by title, author or tag" });
  const open = async (number) => {
    await navigator.fill(`Research ${String(number).padStart(4, "0")}`);
    await page
      .getByRole("option", { name: new RegExp(`Research ${String(number).padStart(4, "0")}`) })
      .dblclick();
  };
  const tab = (name) =>
    page
      .locator(".reader-dock-tab:not(.is-side)")
      .filter({ has: page.locator(".dv-default-tab-content", { hasText: name }) });
  const sideTab = (id) => page.locator(`.reader-dock-tab[data-panel-id="${id}"]`);
  const menu = async (target, label) => {
    await target.click({ button: "right" });
    await page.getByText(label, { exact: true }).click();
  };
  const state = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("mdbase-reader:dockview:v1:test-reader-audit")),
    );
  const panelGroup = (data, id) => {
    const visit = (node) =>
      node.type === "leaf"
        ? node.data.views.includes(id)
          ? node.data.id
          : null
        : node.data.map(visit).find(Boolean);
    return (
      visit(data.layout.grid.root) ??
      Object.values(data.layout.edgeGroups ?? {}).find((edge) => edge.group.views.includes(id))
        ?.group.id ??
      null
    );
  };
  const drag = async (target, point) => {
    const rect = await target.boundingBox();
    if (!rect) throw new Error("Drag source is not visible");
    await page.mouse.move(rect.x + Math.min(rect.width / 2, 65), rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + Math.min(rect.width / 2, 65) + 12, rect.y + rect.height / 2, {
      steps: 4,
    });
    await page.mouse.move(point.x, point.y, { steps: 25 });
    await page.waitForTimeout(200);
    await page.mouse.up();
  };

  await open(1);
  const firstId = await tab("[test] Research 0001").getAttribute("data-panel-id");
  const firstSession = page.locator(`[data-session-id="${firstId}"]`);
  await expect(firstSession.locator("iframe.html-viewer")).toBeVisible();
  const firstHtml = firstSession.frameLocator("iframe.html-viewer").locator("html");
  await firstHtml.evaluate((element) => {
    element.ownerDocument.defaultView.__dockviewSentinel = "same-document";
    element.ownerDocument.defaultView.scrollTo(0, 1000);
  });
  await menu(tab("[test] Research 0001"), "Move to new pane right");
  await expect(firstSession.locator("iframe.html-viewer")).toBeVisible();
  expect(
    await firstHtml.evaluate((element) => element.ownerDocument.defaultView.__dockviewSentinel),
  ).toBe("same-document");
  await open(2);
  const secondId = await tab("[test] Research 0002").last().getAttribute("data-panel-id");
  await expect.poll(async () => panelGroup(await state(), secondId)).not.toBeNull();
  const originalGroup = panelGroup(await state(), secondId);
  // The original central group still contains the Library tab. Drop on its tab strip.
  const library = tab("Library").filter({
    has: page.locator(".dv-default-tab-content", { hasText: /^Library$/ }),
  });
  const libraryRect = await page
    .locator(".dv-groupview")
    .filter({ has: library })
    .locator(".dv-tabs-and-actions-container")
    .boundingBox();
  await drag(page.locator(`[data-panel-id="${secondId}"]`), {
    x: libraryRect.x + libraryRect.width / 2,
    y: libraryRect.y + libraryRect.height / 2,
  });
  await expect.poll(async () => panelGroup(await state(), secondId)).not.toBe(originalGroup);
  await expect(page.locator(`[data-session-id="${secondId}"] iframe.html-viewer`)).toBeVisible();
  // The now-visible first document must not have been remounted while its sibling moved.
  expect(
    await firstHtml.evaluate((element) => element.ownerDocument.defaultView.__dockviewSentinel),
  ).toBe("same-document");
  expect(
    await firstHtml.evaluate((element) => element.ownerDocument.defaultView.scrollY),
  ).toBeGreaterThan(800);
  completed.push(
    "Pointer drag between tab groups succeeds; existing HTML iframe and reading position survive",
  );

  // Focusing an iframe must select its source, not leave the inspector on the sibling.
  const firstBounds = await firstSession.locator("iframe.html-viewer").boundingBox();
  await page.mouse.click(firstBounds.x + 30, firstBounds.y + 80);
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await expect(page.getByRole("complementary", { name: "Source workspace" })).toContainText(
    "Research 0001",
  );
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  completed.push("Clicking an embedded document changes the inspector source correctly");

  // Drag the first document over the second document's content (across an iframe).
  const destination = await page.locator(`[data-session-id="${secondId}"]`).boundingBox();
  const beforeMerge = panelGroup(await state(), firstId);
  await drag(tab("[test] Research 0001"), {
    x: destination.x + destination.width / 2,
    y: destination.y + destination.height / 2,
  });
  await expect.poll(async () => panelGroup(await state(), firstId)).not.toBe(beforeMerge);
  expect(
    await firstHtml.evaluate((element) => element.ownerDocument.defaultView.__dockviewSentinel),
  ).toBe("same-document");
  completed.push("Pointer drop over document content works without iframe reload");

  // Source tools are a real panel: move alongside / tab with a document, preserving context.
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await expect(page.getByRole("complementary", { name: "Source workspace" })).toContainText(
    "Research 0001",
  );
  const inspectorId = "reader:inspector";
  const inspectorGroup = panelGroup(await state(), inspectorId);
  // Dockview 8.3.1 edge-to-header drops are unreliable; the native content-centre target works.
  const docRect = await firstSession.locator("iframe.html-viewer").boundingBox();
  await drag(sideTab("reader:inspector"), {
    x: docRect.x + docRect.width / 2,
    y: docRect.y + docRect.height / 2,
  });
  await expect.poll(async () => panelGroup(await state(), inspectorId)).not.toBe(inspectorGroup);
  await expect(page.getByRole("complementary", { name: "Source workspace" })).toContainText(
    "Research 0001",
  );
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Source workspace" })).toContainText(
    "Research 0001",
  );
  completed.push(
    "Source tools dock into document groups and restore the correct source context after reload",
  );

  await tab("[test] Research 0001").click();
  // A document's actions sit in the tab strip of the pane that shows it.
  await page
    .locator(`.dv-groupview:has(.reader-dock-tab[data-panel-id="${firstId}"]) .dock-pane-actions`)
    .getByLabel("More document actions", { exact: true })
    .click();
  await page.getByRole("button", { name: "Literature note", exact: true }).click();
  const noteTab = tab("Literature note — [test] Research 0001");
  const noteId = await noteTab.getAttribute("data-panel-id");
  const editor = page.getByRole("textbox", { name: "Source literature note" });
  blockWrites(true);
  await editor.fill("[test] Docking never discards this local draft.");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await menu(noteTab, "Move to new pane below");
  await expect(editor).toContainText("Docking never discards");
  // Close confirmation is only needed when neither local nor collection storage is safe.
  await blockSourceDraftStorage(page, true);
  await editor.fill("[test] Docking never discards this local draft. Storage failure.");
  await expect(page.locator(".draft-recovery.is-error")).toBeVisible();
  page.removeAllListeners("dialog");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await noteTab.locator(".reader-tab-close").click();
  await expect(page.locator(`[data-panel-id="${noteId}"]`)).toBeVisible();
  await expect(editor).toContainText("Docking never discards");
  page.on("dialog", (dialog) => void dialog.accept());
  await blockSourceDraftStorage(page, false);
  await editor.fill("[test] Docking never discards this local draft. Storage recovered.");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await screenshot("dockview-dirty-note-and-tools");
  completed.push(
    "Unstored note survives docking and cancelled close; local recovery resumes after storage returns",
  );

  const navigationLayout = JSON.stringify((await state()).layout.grid.root);
  const noteBounds = await page.locator(`[data-session-id="${noteId}"]`).boundingBox();
  await drag(sideTab("reader:navigator"), {
    x: noteBounds.x + noteBounds.width / 2,
    y: noteBounds.y + noteBounds.height - 20,
  });
  // Moving a singleton can relocate the entire group without changing its ID.
  await expect
    .poll(async () => JSON.stringify((await state()).layout.grid.root))
    .not.toBe(navigationLayout);
  await expect.poll(async () => (await navigator.boundingBox()).y).toBeGreaterThan(noteBounds.y);
  await expect(navigator).toBeVisible();
  await page.locator(`[data-panel-id="${noteId}"]`).click();
  completed.push("Library navigator also docks to document edges");

  // Native touch input exercises Dockview's pointer strategy, not DOM-dispatched fake drags.
  const touchSource = await sideTab("reader:navigator").boundingBox();
  const touchTarget = await page.locator(`[data-panel-id="${noteId}"]`).boundingBox();
  const touchStart = { x: touchSource.x + 55, y: touchSource.y + touchSource.height / 2 };
  const touchEnd = { x: touchTarget.x + 70, y: touchTarget.y + touchTarget.height / 2 };
  const beforeTouchGroup = panelGroup(await state(), "reader:navigator");
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...touchStart, id: 1 }],
    });
    await page.waitForTimeout(300);
    for (let step = 1; step <= 20; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: touchStart.x + ((touchEnd.x - touchStart.x) * step) / 20,
            y: touchStart.y + ((touchEnd.y - touchStart.y) * step) / 20,
            id: 1,
          },
        ],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect
      .poll(async () => panelGroup(await state(), "reader:navigator"))
      .not.toBe(beforeTouchGroup);
  } finally {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await cdp.detach();
  }
  await page.locator(`[data-panel-id="${noteId}"]`).click();
  await expect(editor).toContainText("Docking never discards");
  completed.push("Native touch drag docks the navigator into a tab group");

  const beforeReload = await state();
  const savedNoteGroup = panelGroup(beforeReload, noteId);
  await page.reload();
  await expect(page.locator(`[data-panel-id="${noteId}"]`)).toBeVisible({ timeout: 20000 });
  await expect(editor).toContainText("Docking never discards");
  await expect.poll(async () => panelGroup(await state(), noteId)).toBe(savedNoteGroup);
  completed.push("Dockview group placement, side panels, and local drafts survive reload");
  blockWrites(false);

  // Keyboard-accessible pane menu offers the same operations; reset never closes tabs.
  await page.locator(`[data-panel-id="${noteId}"]`).click();
  await page.getByRole("button", { name: "Search and commands" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("textbox", { name: "Search commands and sources" })
    .fill("Reset pane arrangement");
  await page.keyboard.press("Enter");
  await expect(page.locator(`[data-panel-id="${noteId}"]`)).toBeVisible();
  await expect(editor).toContainText("Docking never discards");
  completed.push("Keyboard layout reset preserves open tabs and drafts");
  await screenshot("dockview-reset");

  const paneMenu = page
    .locator(".dv-groupview")
    .filter({ has: page.locator(`[data-panel-id="${noteId}"]`) })
    .getByRole("button", { name: "Pane actions", exact: true });
  for (const maximized of [true, false]) {
    await paneMenu.focus();
    await page.keyboard.press("Enter");
    const action = page
      .getByRole("group", { name: "Pane actions" })
      .getByRole("button", { name: "Maximize / restore pane", exact: true });
    await expect(action).toBeVisible();
    await action.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("complementary", { name: "Library navigator" })).toHaveCount(
      maximized ? 0 : 1,
    );
  }
  completed.push("Native pane-action popover works by keyboard above document overlays");

  const libraryPanel = page.getByRole("complementary", { name: "Library navigator" });
  const beforeResize = await libraryPanel.boundingBox();
  await page.mouse.move(
    beforeResize.x + beforeResize.width,
    beforeResize.y + beforeResize.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    beforeResize.x + beforeResize.width + 80,
    beforeResize.y + beforeResize.height / 2,
    { steps: 15 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await libraryPanel.boundingBox()).width)
    .toBeGreaterThan(beforeResize.width + 50);
  const resizedWidth = (await libraryPanel.boundingBox()).width;
  await page.reload();
  await expect
    .poll(async () => (await libraryPanel.boundingBox())?.width ?? 0)
    .toBeCloseTo(resizedWidth, 0);
  completed.push("Native Dockview sidebar resize persists across reload");

  await page.locator(`[data-panel-id="${noteId}"]`).locator(".reader-tab-close").click();
  await expect(page.locator(`[data-panel-id="${noteId}"]`)).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Search and commands" }).click();
  await page
    .getByRole("textbox", { name: "Search commands and sources" })
    .fill("Reopen closed tab");
  await page.keyboard.press("Enter");
  await expect(page.locator(`[data-panel-id="${noteId}"]`)).toBeVisible();
  await expect(editor).toContainText("Docking never discards");
  completed.push("Reopen closed tab retains its identity and draft across a reload");
  return completed;
}
