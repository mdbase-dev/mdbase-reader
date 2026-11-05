import { Orientation, type DockviewApi, type SerializedDockview } from "dockview-react";
import { expect, it, vi } from "vitest";

import { navigatorPanelId, inspectorPanelId } from "./dockview-panel-ids.js";
import { ResponsiveDockLayout } from "./dockview-responsive-layout.js";

it("keeps native desktop geometry while reconciling the phone layout", () => {
  let state: SerializedDockview = {
    grid: {
      width: 1440,
      height: 850,
      orientation: Orientation.HORIZONTAL,
      root: { type: "leaf", data: { id: "main", views: ["book"], activeView: "book" } },
    },
    panels: Object.fromEntries(
      ["book", navigatorPanelId, inspectorPanelId].map((id) => [
        id,
        { id, contentComponent: "workspace" },
      ]),
    ),
    activeGroup: "main",
    edgeGroups: {
      left: {
        size: 275,
        visible: true,
        group: { id: "left", views: [navigatorPanelId], activeView: navigatorPanelId },
      },
      right: {
        size: 365,
        visible: true,
        group: { id: "right", views: [inspectorPanelId], activeView: inspectorPanelId },
      },
    },
  };
  const api = {
    toJSON: () => structuredClone(state),
    fromJSON: (next: SerializedDockview) => {
      state = structuredClone(next);
    },
    exitMaximizedGroup: vi.fn(),
    removeEdgeGroup: vi.fn(),
    getEdgeGroup: vi.fn(),
  } as unknown as DockviewApi;
  const layout = new ResponsiveDockLayout();
  layout.seed(state);
  layout.setMobile(api, true, "book");
  state.grid.width = 390;
  layout.remember(api);
  layout.setMobile(api, false, "book");
  expect(state.edgeGroups?.left?.size).toBe(275);
  expect(state.edgeGroups?.right?.size).toBe(365);
  expect(state.grid.width).toBe(1440);
});
