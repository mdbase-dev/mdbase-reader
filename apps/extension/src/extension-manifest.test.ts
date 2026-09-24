import { describe, expect, it } from "vitest";

import { extensionEnvironment, extensionManifest } from "../scripts/extension-manifest.mjs";

describe("per-environment extension manifest", () => {
  it("defaults to LAB and only permanently reaches that Connect service", () => {
    const environment = extensionEnvironment({});
    const manifest = extensionManifest(environment);
    expect(environment).toMatchObject({
      target: "lab",
      label: "LAB",
      connectUrl: "https://connect-lab.mdbase.dev",
      readerOrigin: "https://lab.mdbase-reader.pages.dev",
    });
    expect(manifest["host_permissions"]).toEqual(["https://connect-lab.mdbase.dev/*"]);
    expect(manifest["optional_host_permissions"]).toEqual(["https://*/*"]);
    expect(manifest["name"]).toBe("mdbase Reader (LAB)");
  });

  it("targets production without an environment label", () => {
    const environment = extensionEnvironment({ MDBASE_ENV: "production" });
    expect(environment.label).toBe("");
    expect(extensionManifest(environment)).toMatchObject({
      name: "mdbase Reader",
      host_permissions: ["https://connect.mdbase.dev/*"],
    });
  });

  it("declares the side panel, shortcuts and no broad permanent access", () => {
    const manifest = extensionManifest(extensionEnvironment({ MDBASE_ENV: "staging" }));
    expect(manifest["permissions"]).toContain("sidePanel");
    expect(manifest["permissions"]).not.toContain("tabs");
    expect(Object.keys(manifest["commands"] as object)).toEqual([
      "_execute_action",
      "save-highlight",
    ]);
  });

  it("rejects unknown environments", () => {
    expect(() => extensionEnvironment({ MDBASE_ENV: "qa" })).toThrow("Unsupported");
  });
});
