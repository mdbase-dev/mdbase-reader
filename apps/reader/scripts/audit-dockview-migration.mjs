import { expect } from "@playwright/test";

export async function auditDockviewMigration(page) {
  await page.addInitScript(() => {
    if (globalThis.top !== globalThis || globalThis.location.protocol !== "http:") return;
    if (sessionStorage.getItem("test:dock-migration-seeded")) return;
    sessionStorage.setItem("test:dock-migration-seeded", "yes");
    const tab = (sourceId, view) => ({
      id: `${sourceId}::${view}`,
      kind: "source",
      sourceId,
      view,
      dirty: false,
      preview: false,
      pinned: false,
    });
    const library = {
      id: "library::all-sources",
      kind: "library",
      view: "library",
      libraryViewId: "all-sources",
      title: "Library",
      dirty: false,
      preview: false,
      pinned: true,
    };
    const legacy = {
      version: 2,
      panes: [
        {
          id: "primary",
          tabs: [library, tab("test_0000", "document")],
          activeTabId: "test_0000::document",
          history: { entries: [], index: -1 },
        },
        {
          id: "secondary",
          tabs: [tab("test_0001", "document"), tab("test_0001", "note")],
          activeTabId: "test_0001::document",
          history: { entries: [], index: -1 },
        },
      ],
      focusedPaneId: "primary",
      splitDirection: "vertical",
      splitRatio: 0.6,
      recentlyClosed: [],
      recentSourceIds: ["test_0000", "test_0001"],
    };
    localStorage.removeItem("mdbase-reader:dockview:v1:test-reader-audit");
    localStorage.setItem("mdbase-reader:workspace:v2:test-reader-audit", JSON.stringify(legacy));
  });
  await page.reload();
  await expect(page.locator(".document-session.is-active iframe.html-viewer")).toHaveCount(2, {
    timeout: 30000,
  });
  const snapshot = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("mdbase-reader:dockview:v1:test-reader-audit")),
    );
  await expect
    .poll(
      async () =>
        Object.values((await snapshot()).layout.panels).filter(
          (panel) => panel.contentComponent === "workspace",
        ).length,
    )
    .toBe(4);
  const state = await snapshot();
  const groups = [];
  const visit = (node) => {
    if (node.type === "leaf") groups.push(node.data);
    else node.data.forEach(visit);
  };
  visit(state.layout.grid.root);
  const sourceGroups = groups.filter((group) =>
    group.views.some((id) => state.layout.panels[id].params?.tab),
  );
  expect(sourceGroups).toHaveLength(2);
  expect(sourceGroups.map((group) => group.views.length).sort()).toEqual([2, 2]);
  const activeTabs = sourceGroups.map((group) => state.layout.panels[group.activeView].params.tab);
  expect(activeTabs.map((tab) => tab.view)).toEqual(["document", "document"]);
  expect(activeTabs.map((tab) => tab.sourceId).sort()).toEqual(["test_0000", "test_0001"]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.workspace-pane[aria-hidden="false"]')).toHaveCount(1);
  // On a phone the sidebars have no header buttons while a source shows; shortcuts open them.
  await page.keyboard.press("Control+Backslash");
  await expect(page.getByRole("complementary", { name: "Library navigator" })).toBeVisible();
  await expect(page.locator('.workspace-pane[aria-hidden="false"]')).toHaveCount(0);
  await page.keyboard.press("Control+Backslash");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.workspace-pane[aria-hidden="false"]')).toHaveCount(2);

  // Exercise the deployed v1 native-grid format, not just the older custom pane format.
  const nativeV1 = structuredClone(state);
  nativeV1.version = 1;
  const edge = nativeV1.layout.edgeGroups.left;
  const grid = nativeV1.layout.grid;
  nativeV1.layout.grid = {
    ...grid,
    width: grid.width + 280,
    orientation: "HORIZONTAL",
    root: {
      type: "branch",
      data: [
        { type: "leaf", size: 280, data: edge.group },
        { ...grid.root, size: grid.width },
      ],
    },
  };
  delete nativeV1.layout.edgeGroups;
  const serializedV1 = JSON.stringify(nativeV1);
  await page.addInitScript((value) => {
    if (globalThis.top !== globalThis || globalThis.location.protocol !== "http:") return;
    if (sessionStorage.getItem("test:native-v1-seeded")) return;
    sessionStorage.setItem("test:native-v1-seeded", "yes");
    const key = "mdbase-reader:dockview:v1:test-reader-audit";
    localStorage.removeItem(`${key}:before-edges`);
    localStorage.setItem(key, value);
  }, serializedV1);
  await page.reload();
  await expect(page.locator(".document-session.is-active iframe.html-viewer")).toHaveCount(2, {
    timeout: 30000,
  });
  await expect.poll(async () => (await snapshot()).version).toBe(2);
  await expect.poll(async () => (await snapshot()).layout.edgeGroups?.left?.size).toBe(280);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("mdbase-reader:dockview:v1:test-reader-audit:before-edges"),
    ),
  ).toBe(serializedV1);
  await expect(
    page
      .locator(".dv-groupview")
      .filter({ has: page.locator('[data-panel-id="reader:navigator"]') }),
  ).toHaveClass(/dv-groupview-header-top/u);

  await page.addInitScript(() => {
    if (globalThis.top !== globalThis || globalThis.location.protocol !== "http:") return;
    if (sessionStorage.getItem("test:dock-invalid-seeded")) return;
    sessionStorage.setItem("test:dock-invalid-seeded", "yes");
    localStorage.setItem("mdbase-reader:dockview:v1:test-reader-audit", "{broken-layout");
  });
  await page.reload();
  await expect(page.locator(".document-session.is-active iframe.html-viewer")).toHaveCount(2, {
    timeout: 30000,
  });
  expect(
    await page.evaluate(() =>
      localStorage.getItem("mdbase-reader:dockview:v1:test-reader-audit:recovery"),
    ),
  ).toBe("{broken-layout");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("mdbase-reader:workspace:v2:test-reader-audit")).version,
    ),
  ).toBe(2);
  return [
    "Legacy two-pane layout migrates with both active tabs and no duplicated editors",
    "Mobile presents one native group without exposing hidden reading panes",
    "Deployed native v1 layouts migrate to top-header edges and preserve a pre-migration backup",
    "Malformed Dockview state recovers safely and retains the legacy and recovery copies",
  ];
}
