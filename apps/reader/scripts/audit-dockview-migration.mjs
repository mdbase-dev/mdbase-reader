import { expect } from "@playwright/test";

export async function auditDockviewMigration(page) {
  await page.addInitScript(() => {
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
  await page.getByRole("button", { name: "Toggle library navigator" }).click();
  await expect(page.getByRole("complementary", { name: "Library navigator" })).toBeVisible();
  await expect(page.locator('.workspace-pane[aria-hidden="false"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle library navigator" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.workspace-pane[aria-hidden="false"]')).toHaveCount(2);

  await page.addInitScript(() => {
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
    "Mobile maximizes one group without exposing hidden reading panes",
    "Malformed Dockview state recovers safely and retains the legacy and recovery copies",
  ];
}
