import { expect } from "@playwright/test";

/** Compare the same real Reader interactions with grid and experimental edge sidebars. */
export async function auditSidebarLayout(page, { screenshot, measurements }) {
  const results = (measurements.sidebars = {});
  const navigator = page.getByRole("complementary", { name: "Library navigator" });
  const inspector = page.getByRole("complementary", { name: "Source workspace" });
  const tab = (n) =>
    page.locator(".reader-dock-tab").filter({
      has: page.locator(".dv-default-tab-content", {
        hasText: `[test] Research ${String(n).padStart(4, "0")}`,
      }),
    });
  const open = async (n) => {
    await navigator
      .getByRole("textbox", { name: "Find a source by title, author or tag" })
      .fill(`Research ${String(n).padStart(4, "0")}`);
    await page
      .getByRole("option", { name: new RegExp(`Research ${String(n).padStart(4, "0")}`) })
      .dblclick();
    await expect(tab(n)).toBeVisible();
  };
  const menu = async (n, label) => {
    await tab(n).click({ button: "right" });
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  const measure = async (name) => {
    // Dockview measures and persists asynchronously. This is a geometry observation, not a speed test.
    await page.waitForTimeout(350);
    const box = async (locator) => ((await locator.isVisible()) ? locator.boundingBox() : null);
    results[name] = {
      navigator: await box(navigator),
      inspector: await box(inspector),
      navigatorGroup: await box(
        page
          .locator(".dv-groupview")
          .filter({ has: page.locator('[data-panel-id="reader:navigator"]') }),
      ),
      inspectorGroup: await box(
        page
          .locator(".dv-groupview")
          .filter({ has: page.locator('[data-panel-id="reader:inspector"]') }),
      ),
      document: await box(page.locator("iframe.html-viewer:visible").first()),
    };
    results[name].savedEdges = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("mdbase-reader:dockview:v1:test-reader-audit"))?.layout
          .edgeGroups,
    );
    await screenshot(`sidebar-${name}`);
  };
  await open(0);
  const documentId = await tab(0).getAttribute("data-panel-id");
  const reading = page.locator(`[data-session-id="${documentId}"] iframe.html-viewer`);
  await expect(reading).toBeVisible();
  const html = page
    .frameLocator(`[data-session-id="${documentId}"] iframe.html-viewer`)
    .locator("html");
  await html.evaluate((element) => {
    element.ownerDocument.defaultView.__sidebarSentinel = "original";
    element.ownerDocument.defaultView.scrollTo(0, 900);
  });
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await expect(inspector).toBeVisible();
  await measure("initial");
  for (const n of [1, 2, 3]) {
    await open(n);
    await menu(n, "Move to new pane right");
    await measure(`split-${n}`);
    await tab(n).locator(".reader-tab-close").click();
    await measure(`closed-${n}`);
  }
  await tab(0).click();
  results.iframePreserved = await html.evaluate(
    (element) =>
      element.ownerDocument.defaultView.__sidebarSentinel === "original" &&
      element.ownerDocument.defaultView.scrollY > 700,
  );
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await measure("inspector-hidden");
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await measure("inspector-restored");
  const beforeResize = await navigator.boundingBox();
  await page.mouse.move(
    beforeResize.x + beforeResize.width,
    beforeResize.y + beforeResize.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    beforeResize.x + beforeResize.width + 55,
    beforeResize.y + beforeResize.height / 2,
    { steps: 15 },
  );
  await page.mouse.up();
  await measure("resized");
  await page.reload();
  await expect(reading).toBeVisible();
  await measure("reloaded");
  // Native maximize and narrow-screen behaviour are part of acceptance, not just desktop sizing.
  await menu(0, "Maximize / restore pane");
  await measure("maximized");
  await menu(0, "Maximize / restore pane");
  await measure("restored");
  await page.setViewportSize({ width: 390, height: 844 });
  await measure("mobile-reading");
  await page.getByRole("button", { name: "Toggle left sidebar" }).click();
  await measure("mobile-navigator");
  await page.getByRole("button", { name: "Toggle left sidebar" }).click();
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await measure("mobile-inspector");
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await measure("desktop-again");
  results.acceptance = sidebarAcceptance(results);
  return [
    "Sidebar comparison captured (see acceptance flags): split/close, toggle, resize/reload, maximize, mobile, iframe identity",
  ];
}

function sidebarAcceptance(results) {
  const sameWidth = (a, b) => Boolean(a && b && Math.abs(a.width - b.width) < 1);
  const only = (stage, name, width) =>
    Boolean(
      results[stage][name === "document" ? name : `${name}Group`]?.width >= width - 1 &&
      ["navigator", "inspector", "document"].every(
        (other) => other === name || results[stage][other] === null,
      ),
    );
  return {
    stableSplitCloseWidths: [1, 2, 3].every((n) =>
      ["navigatorGroup", "inspectorGroup"].every((side) =>
        sameWidth(results.initial[side], results[`closed-${n}`][side]),
      ),
    ),
    stableInspectorToggle: ["navigatorGroup", "inspectorGroup"].every((side) =>
      sameWidth(results.initial[side], results["inspector-restored"][side]),
    ),
    resizedWidthsSurviveReload: ["navigatorGroup", "inspectorGroup"].every((side) =>
      sameWidth(results.resized[side], results.reloaded[side]),
    ),
    wholeWorkspaceMaximize: only("maximized", "document", 1440),
    mobileReadingOnly: only("mobile-reading", "document", 390),
    mobileNavigatorOnly: only("mobile-navigator", "navigator", 390),
    mobileInspectorOnly: only("mobile-inspector", "inspector", 390),
    iframePreserved: results.iframePreserved,
  };
}
