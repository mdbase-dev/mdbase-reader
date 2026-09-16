import { Orientation, type SerializedDockview } from "dockview-react";
import { describe, expect, it } from "vitest";

import { migrateEdgeSidebars, validateEdgeState } from "./dockview-edge-state.js";
import { inspectorPanelId, navigatorPanelId } from "./dockview-panel-ids.js";
import {
  desktopLayout,
  gridGroups,
  mobileGroupId,
  mobileLayout,
} from "./dockview-responsive-state.js";

const a = "reader:session:a",
  b = "reader:session:b",
  c = "reader:session:c";
function layout(): SerializedDockview {
  return {
    grid: {
      width: 800,
      height: 900,
      orientation: Orientation.HORIZONTAL,
      root: {
        type: "branch",
        data: [
          { type: "leaf", size: 300, data: { id: "first", views: [a], activeView: a } },
          { type: "leaf", size: 500, data: { id: "second", views: [b], activeView: b } },
        ],
      },
    },
    panels: Object.fromEntries(
      [a, b, navigatorPanelId].map((id) => [
        id,
        { id, contentComponent: "workspace", params: { tab: { id, dirty: true } } },
      ]),
    ),
    activeGroup: "first",
    edgeGroups: {
      left: {
        size: 315,
        visible: false,
        group: { id: "left", views: [navigatorPanelId], activeView: navigatorPanelId },
      },
    },
  };
}
describe("responsive native layout projections", () => {
  it("uses one mobile group without losing identities or dirty live descriptors", () => {
    const desktop = layout(),
      mobile = mobileLayout(desktop, b);
    expect(mobile.edgeGroups).toBeUndefined();
    expect(gridGroups(mobile.grid.root)).toEqual([
      { id: mobileGroupId, views: [a, b, navigatorPanelId], activeView: b },
    ]);
    expect(mobile.panels[a]?.params?.["tab"]).toEqual({ id: a, dirty: true });
    expect(gridGroups(desktop.grid.root)).toHaveLength(2);
  });
  it("keeps desktop geometry and hidden edges, while merging mobile opens and closes", () => {
    const desktop = layout(),
      mobile = mobileLayout(structuredClone(desktop), a),
      before = structuredClone(desktop);
    Reflect.deleteProperty(mobile.panels, b);
    mobile.panels[c] = { id: c, contentComponent: "workspace" };
    const restored = desktopLayout(desktop, mobile, c);
    expect(gridGroups(restored.grid.root)).toEqual([{ id: "first", views: [a, c], activeView: c }]);
    expect(restored.edgeGroups?.left).toEqual(desktop.edgeGroups?.left);
    expect(restored.grid.width).toBe(800);
    expect(desktop).toEqual(before);
  });
  it("creates a missing desktop content group and the correct edge for new mobile tools", () => {
    const desktop = layout(),
      mobile = mobileLayout(structuredClone(desktop), null);
    Reflect.deleteProperty(mobile.panels, a);
    Reflect.deleteProperty(mobile.panels, b);
    mobile.panels[c] = { id: c, contentComponent: "workspace" };
    mobile.panels[inspectorPanelId] = { id: inspectorPanelId, contentComponent: "inspector" };
    const restored = desktopLayout(desktop, mobile, c);
    expect(gridGroups(restored.grid.root)[0]?.views).toEqual([c]);
    expect(restored.edgeGroups?.right).toMatchObject({
      size: 340,
      visible: true,
      group: { views: [inspectorPanelId] },
    });
    expect(JSON.stringify(restored)).not.toContain(mobileGroupId);
  });
  it("restores the focused document in an edge if the user docked it there", () => {
    const desktop = layout();
    desktop.grid.root = { type: "branch", data: [] };
    desktop.edgeGroups = {
      left: {
        size: 315,
        visible: false,
        group: { id: "left", views: [a, b, navigatorPanelId], activeView: a },
      },
    };
    const restored = desktopLayout(desktop, mobileLayout(desktop, b), b);
    expect(restored.activeGroup).toBe("left");
    expect(restored.edgeGroups?.left).toMatchObject({
      visible: true,
      collapsed: false,
      group: { activeView: b },
    });
  });
  it("does not replay a native maximize index path into a different tree", () => {
    const desktop = layout();
    Object.assign(desktop.grid, { maximizedNode: { location: [1] } });
    const mobile = mobileLayout(desktop, b);
    expect(mobile.grid).not.toHaveProperty("maximizedNode");
    expect(desktopLayout(desktop, mobile, b).grid).not.toHaveProperty("maximizedNode");
  });
  it("drops a stale active group when every panel was closed", () => {
    const desktop = layout(),
      current = mobileLayout(structuredClone(desktop), a);
    current.panels = {};
    expect(desktopLayout(desktop, current, a).activeGroup).toBeUndefined();
  });
});
describe("edge persistence and migration", () => {
  it("migrates standalone shell groups without moving mixed groups or source sessions", () => {
    const old = layout();
    delete old.edgeGroups;
    old.grid.root = {
      type: "branch",
      data: [
        { type: "leaf", size: 270, data: { id: "navigator", views: [navigatorPanelId] } },
        {
          type: "leaf",
          size: 530,
          data: { id: "mixed", views: [a, inspectorPanelId], activeView: a },
        },
      ],
    };
    migrateEdgeSidebars(old);
    const migrated = structuredClone(old);
    expect(migrated.edgeGroups?.left).toMatchObject({
      size: 270,
      group: { id: "navigator", views: [navigatorPanelId] },
    });
    expect(gridGroups(old.grid.root)[0]?.views).toEqual([a, inspectorPanelId]);
    expect(migrated.edgeGroups?.right).toBeUndefined();
  });
  it("does not reinterpret intentional grid docking once an edge layout exists", () => {
    const desktop = layout(),
      before = structuredClone(desktop);
    migrateEdgeSidebars(desktop);
    expect(desktop).toEqual(before);
  });
  it("sanitizes edge presentation and rejects malformed geometry or panel references", () => {
    const valid = layout();
    validateEdgeState(valid);
    expect(valid.edgeGroups?.left).toMatchObject({
      size: 315,
      minimumSize: 180,
      group: { headerPosition: "top" },
    });
    for (const change of [
      { size: -1 },
      { size: "315" },
      { size: Number.NaN },
      { visible: "yes" },
      { group: { id: "first", views: [navigatorPanelId] } },
      { group: { id: "left", views: [a] } },
      { group: { id: "left", views: ["unknown"] } },
      { group: { id: "left", views: [navigatorPanelId, navigatorPanelId] } },
      { group: { id: "left", views: [navigatorPanelId], activeView: a } },
    ]) {
      const invalid = layout();
      Object.assign(invalid.edgeGroups?.left ?? {}, change);
      expect(() => validateEdgeState(invalid)).toThrow();
    }
  });
});
