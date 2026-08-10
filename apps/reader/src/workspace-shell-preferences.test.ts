import { describe, expect, it } from "vitest";

import { parseShellPreferences, snapPanelSize } from "./workspace-shell-preferences.js";

describe("workspace shell preferences", () => {
  it("clamps stored dimensions and validates dock choices", () => {
    expect(
      parseShellPreferences({ libraryWidth: 900, inspectorHeight: 20, inspectorDock: "left" }),
    ).toMatchObject({ libraryWidth: 420, inspectorHeight: 220, inspectorDock: "right" });
  });

  it("snaps near common panel sizes without making free resize sticky", () => {
    expect(snapPanelSize(281, [272, 320])).toBe(272);
    expect(snapPanelSize(294, [272, 320])).toBe(294);
  });
});
