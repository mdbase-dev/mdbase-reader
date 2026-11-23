import { describe, expect, it } from "vitest";

import { parseShellPreferences } from "./workspace-shell-preferences.js";

describe("workspace shell preferences", () => {
  it("keeps only what Reader still stores, and clamps the text scale", () => {
    expect(
      parseShellPreferences({
        density: "compact",
        sidebarWhileReading: "keep",
        libraryWidth: 900,
        typography: { scale: 9, measure: "wide", face: "sans" },
      }),
    ).toEqual({
      density: "compact",
      typography: { scale: 1.6, measure: "wide", face: "sans" },
    });
  });
});
