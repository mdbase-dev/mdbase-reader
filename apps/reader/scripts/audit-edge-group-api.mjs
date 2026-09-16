import { expect } from "@playwright/test";

/** Vanilla Dockview probe: distinguishes native shell semantics from Reader integration. */
export async function auditEdgeGroupApi(context, origin) {
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/test-fixtures/dockview-edge-probe.html`);
    await page.waitForFunction(
      () => globalThis.edgeProbe?.panels.length === 3 && globalThis.edgeProbe.width > 0,
    );
    const snapshot = () =>
      page.evaluate(() => ({
        maximized: globalThis.edgeProbe.hasMaximizedGroup(),
        groups: globalThis.edgeProbe.groups.map((group) => ({
          id: group.id,
          location: group.api.location,
          width: group.api.width,
          visible: group.activePanel?.api.isVisible,
          maximized: group.api.isMaximized(),
        })),
      }));
    const initial = await snapshot();
    await page.evaluate(() => globalThis.edgeProbe.getPanel("a").api.maximize());
    const centralMaximized = await snapshot();
    expect(centralMaximized.maximized).toBe(true);
    // The edge is outside the maximized grid; this is not a whole-workspace maximize.
    expect(centralMaximized.groups.find(({ id }) => id === "left")).toMatchObject({
      width: 260,
      visible: true,
      maximized: false,
    });
    await page.evaluate(() => {
      globalThis.edgeProbe.exitMaximizedGroup();
      globalThis.edgeProbe.getPanel("nav").api.maximize();
    });
    const edgeMaximized = await snapshot();
    expect(edgeMaximized.maximized).toBe(false);
    return { initial, centralMaximized, edgeMaximized };
  } finally {
    await page.close();
  }
}
