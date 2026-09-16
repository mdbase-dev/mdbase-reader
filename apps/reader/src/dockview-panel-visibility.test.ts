import { expect, it, vi } from "vitest";

import { dockPanelVisible } from "./dockview-panel-visibility.js";

import type { DockviewApi } from "dockview-react";

it("does not confuse an always-mounted edge panel with a visible shell", () => {
  const panel = {
    api: { isVisible: true },
    group: {
      api: {
        location: { type: "edge", position: "left" },
        isCollapsed: vi.fn(() => false),
        isMaximized: vi.fn(() => false),
      },
    },
  };
  const native = {
    getPanel: () => panel,
    isEdgeGroupVisible: vi.fn(() => true),
    hasMaximizedGroup: vi.fn(() => false),
  };
  const api = native as unknown as DockviewApi;
  expect(dockPanelVisible(api, "reader:navigator")).toBe(true);
  native.isEdgeGroupVisible.mockReturnValue(false);
  expect(dockPanelVisible(api, "reader:navigator")).toBe(false);
  native.isEdgeGroupVisible.mockReturnValue(true);
  panel.group.api.isCollapsed.mockReturnValue(true);
  expect(dockPanelVisible(api, "reader:navigator")).toBe(false);
  panel.group.api.isCollapsed.mockReturnValue(false);
  native.hasMaximizedGroup.mockReturnValue(true);
  expect(dockPanelVisible(api, "reader:navigator")).toBe(false);
  expect(dockPanelVisible(null, "reader:navigator")).toBe(false);
});
