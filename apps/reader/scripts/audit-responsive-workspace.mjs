import { expect } from "@playwright/test";
import { blockSourceDraftStorage } from "./audit-source-storage.mjs";

export async function auditResponsiveWorkspace(page, { screenshot, blockWrites }) {
  const completed = [];
  const tab = (name) =>
    page
      .locator(".reader-dock-tab")
      .filter({ has: page.locator(".dv-default-tab-content", { hasText: name }) });
  const open = async (n) => {
    await page
      .getByRole("textbox", { name: "Find a source by title, author or tag" })
      .fill(`Research ${String(n).padStart(4, "0")}`);
    await page
      .getByRole("option", { name: new RegExp(`Research ${String(n).padStart(4, "0")}`) })
      .dblclick();
  };
  const state = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("mdbase-reader:dockview:v1:test-reader-audit")),
    );
  await open(0);
  const first = await tab("[test] Research 0000").getAttribute("data-panel-id");
  await open(1);
  await tab("[test] Research 0001").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to new pane right", exact: true }).click();
  await tab("[test] Research 0000").click();
  const reading = page.locator(`[data-session-id="${first}"] iframe.html-viewer`);
  await expect(reading).toBeVisible();
  const html = page.frameLocator(`[data-session-id="${first}"] iframe.html-viewer`).locator("html");
  await html.evaluate((element) => {
    element.ownerDocument.defaultView.__responsiveSentinel = "original";
    element.ownerDocument.defaultView.scrollTo(0, 900);
  });
  await page
    .locator(`[data-session-id="${first}"]`)
    .getByLabel("More document actions", { exact: true })
    .click();
  await page.getByRole("button", { name: "Source note", exact: true }).click();
  const note = await tab("Source note — [test] Research 0000").getAttribute("data-panel-id");
  const editor = page.getByRole("textbox", { name: "Source literature note" });
  blockWrites(true);
  await editor.fill("[test] Responsive draft stays in the same editor.");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await editor.evaluate((element) => {
    element.dataset.responsiveSentinel = "original-editor";
  });
  await tab("[test] Research 0000").filter({ hasNotText: "Source note" }).click();
  await page.waitForTimeout(350);
  const desktop = (await state()).layout;
  const groups = (node) => (node.type === "leaf" ? [node.data] : node.data.flatMap(groups));
  const originalGroups = groups(desktop.grid.root);
  const originalWidths = Object.fromEntries(
    Object.entries(desktop.edgeGroups).map(([key, value]) => [key, value.size]),
  );
  const sidebarWidths = async () =>
    Object.fromEntries(
      await Promise.all(
        [
          ["left", "reader:navigator"],
          ["right", "reader:inspector"],
        ].map(async ([position, id]) => [
          position,
          Math.round(
            (
              await page
                .locator(".dv-groupview")
                .filter({ has: page.locator(`[data-panel-id="${id}"]`) })
                .boundingBox()
            )?.width ?? 0,
          ),
        ]),
      ),
    );
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("navigation", { name: "Mobile workspace navigation" }),
    ).toBeVisible();
    await expect(reading).toBeVisible();
    expect(
      await html.evaluate((element) => element.ownerDocument.defaultView.__responsiveSentinel),
    ).toBe("original");
    expect(
      await html.evaluate((element) => element.ownerDocument.defaultView.scrollY),
    ).toBeGreaterThan(700);
    await page.getByRole("combobox", { name: "Open workspace tab" }).selectOption(note);
    await expect(editor).toContainText("Responsive draft");
    await expect(editor).toHaveAttribute("data-responsive-sentinel", "original-editor");
    await page.getByRole("combobox", { name: "Open workspace tab" }).selectOption(first);
    for (const name of ["Toggle library navigator", "Toggle source tools"]) {
      await page.getByRole("button", { name }).click();
      await expect(reading).not.toBeVisible();
      await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
      await expect(reading).toBeVisible();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.getByRole("navigation", { name: "Mobile workspace navigation" })).toHaveCount(
      0,
    );
    await expect.poll(sidebarWidths).toEqual(originalWidths);
    await expect
      .poll(async () =>
        Object.fromEntries(
          Object.entries((await state()).layout.edgeGroups).map(([key, value]) => [
            key,
            value.size,
          ]),
        ),
      )
      .toEqual(originalWidths);
    await expect
      .poll(async () =>
        groups((await state()).layout.grid.root).map(({ id, views }) => ({ id, views })),
      )
      .toEqual(originalGroups.map(({ id, views }) => ({ id, views })));
  }
  completed.push(
    "Two desktop/mobile cycles preserve document Window, scroll, editor DOM, draft, split groups, and sidebar widths",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle library navigator" }).click();
  await page
    .getByRole("textbox", { name: "Find a source by title, author or tag" })
    .fill("Research 0002");
  await page.getByRole("option", { name: /Research 0002/u }).click();
  await expect(page.frameLocator("iframe.html-viewer:visible").locator("h1")).toContainText(
    "fixture 2",
  );
  await expect
    .poll(async () => JSON.stringify((await state()).layout))
    .not.toContain("reader:mobile-workspace");
  await page.getByRole("combobox", { name: "Open workspace tab" }).selectOption(note);
  await expect(editor).toContainText("Responsive draft");
  await screenshot("responsive-mobile-draft");
  await expect.poll(async () => (await state()).focusedPanel).toBe(note);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Open workspace tab" })).toBeVisible();
  await page.getByRole("combobox", { name: "Open workspace tab" }).selectOption(note);
  await expect(editor).toContainText("Responsive draft");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect
    .poll(async () =>
      Object.fromEntries(
        Object.entries((await state()).layout.edgeGroups).map(([key, value]) => [key, value.size]),
      ),
    )
    .toEqual(originalWidths);
  await expect(tab("[test] Research 0002")).toHaveCount(1);
  await expect(editor).toContainText("Responsive draft");
  await screenshot("responsive-desktop-restored");
  completed.push(
    "Mobile source opening and reload retain new tabs and recover drafts without replacing the saved desktop arrangement",
  );
  // Whole-workspace maximize is separate from the phone presentation.
  await tab("Source note — [test] Research 0000").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Maximize / restore pane", exact: true }).click();
  const notePane = page.locator(`[data-session-id="${note}"]`);
  await expect.poll(async () => (await notePane.boundingBox())?.width ?? 0).toBeGreaterThan(1400);
  await expect(page.getByRole("complementary", { name: "Library navigator" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor).toBeVisible();
  await page.getByRole("button", { name: "Toggle source tools" }).click();
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(async () => (await notePane.boundingBox())?.width ?? 0).toBeGreaterThan(1400);
  await tab("Source note — [test] Research 0000").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Maximize / restore pane", exact: true }).click();
  await expect.poll(sidebarWidths).toEqual(originalWidths);
  completed.push(
    "Whole-workspace maximize survives a phone visit and restores sidebar widths on exit",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await blockSourceDraftStorage(page, true);
  await editor.fill("[test] Responsive draft with an unstored change.");
  await expect(page.locator(".draft-recovery.is-error")).toBeVisible();
  page.removeAllListeners("dialog");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Close current tab", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("Responsive draft");
  await blockSourceDraftStorage(page, false);
  await editor.fill("[test] Responsive draft with storage recovered.");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("combobox", { name: "Open workspace tab" }).selectOption(first);
  await page.getByRole("button", { name: "Close current tab", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(async () => Object.hasOwn((await state()).layout.panels, first)).toBe(false);
  completed.push(
    "Mobile close honors draft cancellation and closed documents do not reappear on desktop",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const picker = page.getByRole("combobox", { name: "Open workspace tab" });
  // evaluateAll does not auto-wait for a newly mounted mobile selector.
  await expect(picker).toBeVisible();
  const remaining = await picker
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
  expect(remaining.length).toBeGreaterThan(0);
  for (const id of remaining) {
    await picker.selectOption(id);
    await page.getByRole("button", { name: "Close current tab", exact: true }).click();
    await expect(picker.locator(`option[value="${id}"]`)).toHaveCount(0);
  }
  await expect(picker).toBeDisabled();
  if (!(await page.getByRole("complementary", { name: "Library navigator" }).isVisible())) {
    await page.getByRole("button", { name: "Toggle library navigator" }).click();
  }
  await page
    .getByRole("textbox", { name: "Find a source by title, author or tag" })
    .fill("Research 0003");
  await page.getByRole("option", { name: /Research 0003/u }).click();
  await expect(page.locator('.workspace-pane[aria-hidden="false"]')).toHaveCount(1);
  await expect(page.locator(".reader-dock .dv-groupview")).toHaveCount(1);
  await expect(page.frameLocator("iframe.html-viewer:visible").locator("h1")).toContainText(
    "fixture 3",
  );
  await screenshot("responsive-mobile-reopened");
  completed.push(
    "Closing every mobile tab and reopening from the navigator never creates a second tiny pane",
  );
  blockWrites(false);
  await page.addInitScript(() => {
    if (globalThis.top !== globalThis || sessionStorage.getItem("test:fresh-mobile")) return;
    sessionStorage.setItem("test:fresh-mobile", "yes");
    localStorage.removeItem("mdbase-reader:dockview:v1:test-reader-audit");
    localStorage.removeItem("mdbase-reader:workspace:v2:test-reader-audit");
  });
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Open workspace tab" })).toBeVisible();
  await expect(page.locator(".reader-dock .dv-groupview")).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(async () => (await state()).layout.edgeGroups?.left?.size).toBe(260);
  completed.push(
    "A first-ever phone session opens as one pane and restores a sensible default desktop sidebar width",
  );
  return completed;
}
