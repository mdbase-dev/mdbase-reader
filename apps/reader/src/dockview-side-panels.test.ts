import { describe, expect, it, vi } from "vitest";

import { inspectorPanelId, navigatorPanelId } from "./dockview-panel-ids.js";
import { DockviewSidePanels } from "./dockview-side-panels.js";

import type { DockviewApi } from "dockview-react";

interface Panel {
  id: string;
  api: { setActive: ReturnType<typeof vi.fn>; moveTo: ReturnType<typeof vi.fn> };
}
function fixture(): {
  sides: DockviewSidePanels;
  api: Pick<
    Record<string, ReturnType<typeof vi.fn>>,
    "getPanel" | "addPanel" | "removePanel" | "getEdgeGroup" | "addEdgeGroup"
  >;
  edge: { expand: ReturnType<typeof vi.fn>; activePanel: Panel };
  visible: { left: boolean; right: boolean };
  activePanel: Panel;
} {
  const visible = { left: true, right: true };
  const activePanel = { id: "custom-tab", api: { setActive: vi.fn(), moveTo: vi.fn() } };
  const edge = { id: "reader:edge:test", expand: vi.fn(), activePanel };
  const added = { id: "reader:edge:new", expand: vi.fn(), setHeaderPosition: vi.fn() };
  const api = {
    groups: [
      { id: edge.id, panels: [activePanel] },
      { id: added.id, panels: [] },
    ],
    addEdgeGroup: vi.fn(() => added),
    isEdgeGroupVisible: (position: "left" | "right") => visible[position],
    setEdgeGroupVisible: vi.fn((position: "left" | "right", value: boolean) => {
      visible[position] = value;
    }),
    getEdgeGroup: vi.fn(() => edge),
    getPanel: vi.fn(),
    addPanel: vi.fn(),
    removePanel: vi.fn(),
    exitMaximizedGroup: vi.fn(),
    hasMaximizedGroup: () => false,
  };
  const sides = new DockviewSidePanels(
    () => api as unknown as DockviewApi,
    () => false,
  );
  return { sides, api, edge, visible, activePanel };
}

describe("sidebar region toggles", () => {
  it.each(["left", "right"] as const)(
    "hides and restores the whole %s edge without changing its tabs",
    (position) => {
      const { sides, api, edge, visible, activePanel } = fixture();
      sides.toggleRegion(position);
      expect(visible[position]).toBe(false);
      expect(visible[position === "left" ? "right" : "left"]).toBe(true);
      sides.toggleRegion(position);
      expect(visible[position]).toBe(true);
      expect(edge.expand).toHaveBeenCalledOnce();
      expect(edge.activePanel).toBe(activePanel);
      expect(activePanel.api.setActive).not.toHaveBeenCalled();
      expect(activePanel.api.moveTo).not.toHaveBeenCalled();
      expect(api.getPanel).not.toHaveBeenCalled();
      expect(api.addPanel).not.toHaveBeenCalled();
      expect(api.removePanel).not.toHaveBeenCalled();
    },
  );

  it("opens the conventional panel when a first toggle finds no edge to restore", () => {
    const { sides, api, visible } = fixture();
    visible.right = false;
    api.getEdgeGroup.mockReturnValue(undefined);
    sides.toggleRegion("right");
    expect(api.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({ id: inspectorPanelId, component: "inspector", inactive: true }),
    );
  });

  it("reports edge visibility independently of where Sources and Notes were moved", () => {
    const { sides, api, visible } = fixture();
    visible.right = false;
    expect(sides.regionVisible("left")).toBe(true);
    expect(sides.regionVisible("right")).toBe(false);
    expect(api.getPanel).not.toHaveBeenCalled();
  });

  it("retains panel navigation on mobile instead of creating edge regions", () => {
    const togglePanel = vi.fn();
    const sides = new DockviewSidePanels(
      () => null,
      () => true,
    );
    sides.toggleSidebar("left", togglePanel);
    sides.toggleSidebar("right", togglePanel);
    expect(togglePanel.mock.calls).toEqual([[navigatorPanelId], [inspectorPanelId]]);
  });

  it("does not invoke panel toggles on desktop", () => {
    const { sides, visible } = fixture();
    const togglePanel = vi.fn();
    sides.toggleSidebar("right", togglePanel);
    expect(visible.right).toBe(false);
    expect(togglePanel).not.toHaveBeenCalled();
  });

  it("is safe before the dock attaches", () => {
    const sides = new DockviewSidePanels(
      () => null,
      () => false,
    );
    expect(sides.regionVisible("left")).toBe(false);
    expect(() => sides.toggleRegion("left")).not.toThrow();
  });
});
