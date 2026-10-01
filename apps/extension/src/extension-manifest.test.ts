import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extensionEnvironment,
  extensionManifest,
  manifestVersion,
} from "../scripts/extension-manifest.mjs";

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
    expect(manifest["host_permissions"]).toEqual([
      "https://connect-lab.mdbase.dev/*",
      "https://*/*",
    ]);
    expect(manifest["optional_host_permissions"]).toEqual(["http://127.0.0.1/*"]);
    expect(manifest["name"]).toBe("mdbase Reader (LAB)");
  });

  it("targets production without an environment label", () => {
    const environment = extensionEnvironment({ MDBASE_ENV: "production" });
    expect(environment.label).toBe("");
    expect(extensionManifest(environment)).toMatchObject({
      name: "mdbase Reader",
      host_permissions: ["https://connect.mdbase.dev/*", "https://*/*"],
    });
  });

  it("declares one window-wide side panel, shortcuts and no tab list access", () => {
    const manifest = extensionManifest(extensionEnvironment({ MDBASE_ENV: "staging" }));
    expect(manifest["permissions"]).toContain("sidePanel");
    expect(manifest["side_panel"]).toEqual({ default_path: "capture.html" });
    expect(manifest["permissions"]).not.toContain("tabs");
    expect(Object.keys(manifest["commands"] as object)).toEqual([
      "_execute_action",
      "save-highlight",
    ]);
  });

  it("ships the mdbase icon at every size Chrome and the Web Store use", () => {
    const manifest = extensionManifest(extensionEnvironment({}));
    const icons = manifest["icons"] as Record<string, string>;
    expect(Object.keys(icons)).toEqual(["16", "32", "48", "128"]);
    for (const path of Object.values(icons)) {
      expect(existsSync(resolve(import.meta.dirname, "../public", path))).toBe(true);
    }
    expect(manifest["action"]).toMatchObject({
      default_icon: { 16: icons["16"], 32: icons["32"] },
    });
  });

  it("takes its version from package.json and has a settings page", () => {
    const manifest = extensionManifest(extensionEnvironment({}));
    expect(manifest["version"]).toBe(manifestVersion().version);
    expect(manifest["options_ui"]).toEqual({ page: "options.html", open_in_tab: true });
  });

  it("ships prereleases under a numeric version with the full version name", () => {
    expect(manifestVersion("0.3.0")).toEqual({ version: "0.3.0" });
    expect(manifestVersion("0.3.0-beta.1")).toEqual({
      version: "0.3.0",
      version_name: "0.3.0-beta.1",
    });
    expect(() => manifestVersion("next")).toThrow("Unsupported");
  });

  it("rejects unknown environments", () => {
    expect(() => extensionEnvironment({ MDBASE_ENV: "qa" })).toThrow("Unsupported");
  });
});
