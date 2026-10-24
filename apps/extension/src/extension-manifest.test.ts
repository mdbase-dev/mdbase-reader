import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extensionEnvironment,
  extensionHostPermissions,
  extensionManifest,
  extensionMdbaseManifest,
  manifestVersion,
} from "../scripts/extension-manifest.mjs";

const stagingId = "palmhjikdacodimpnkapmidobfbocdgf";

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
    // The SDK runs in the extension's pages: it reaches the CP and LAB's log service.
    expect(manifest["host_permissions"]).toEqual([
      "https://connect-lab.mdbase.dev/*",
      "https://mdbase-next-log-lab-20261005.callumalpass.workers.dev/*",
      "https://*/*",
    ]);
    expect(manifest["optional_host_permissions"]).toBeUndefined();
    // The SDK's one owner is an offscreen document.
    expect(manifest["permissions"]).toContain("offscreen");
    expect(manifest["content_security_policy"]).toEqual({
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    });
    expect(environment.extensionOrigins).toEqual([
      "chrome-extension://kimdfjefhbfgfecconmaiaaindjccidp",
    ]);
    expect(manifest["name"]).toBe("mdbase Reader (LAB)");
  });

  it("declares an unpacked build's ID for LAB only", () => {
    const devId = "abcdefghijklmnopabcdefghijklmnop";
    expect(extensionEnvironment({ MDBASE_EXTENSION_DEV_ID: devId }).extensionOrigins).toEqual([
      "chrome-extension://kimdfjefhbfgfecconmaiaaindjccidp",
      `chrome-extension://${devId}`,
    ]);
    expect(() =>
      extensionEnvironment({ MDBASE_ENV: "production", MDBASE_EXTENSION_DEV_ID: devId }),
    ).toThrow(/LAB builds only/u);
    expect(() => extensionEnvironment({ MDBASE_EXTENSION_DEV_ID: "not-an-id" })).toThrow();
  });
});

describe("staging extension environment", () => {
  it("refuses any plausible but unallocated staging identity", () => {
    expect(() =>
      extensionEnvironment({
        MDBASE_ENV: "staging",
        MDBASE_EXTENSION_STAGING_ID: "ponmlkjihgfedcbaponmlkjihgfedcba",
      }),
    ).toThrow(/approved|allocated/);
  });

  it("refuses staging Chrome packaging without its matching public key", () => {
    const environment = extensionEnvironment({
      MDBASE_ENV: "staging",
      MDBASE_EXTENSION_STAGING_ID: stagingId,
    });
    expect(() => extensionManifest(environment)).toThrow(/public key/);
  });

  it("targets staging exactly, with only its configured staging extension ID", () => {
    const environment = extensionEnvironment({
      MDBASE_ENV: "staging",
      MDBASE_EXTENSION_STAGING_ID: stagingId,
    });
    expect(environment).toMatchObject({
      target: "staging",
      label: "STAGING",
      connectUrl: "https://connect-staging.mdbase.dev",
      readerOrigin: "https://staging.mdbase-reader.pages.dev",
      logUrl: "https://log-staging.mdbase.dev",
      loopbackUrl: "",
    });
    expect(environment.extensionOrigins).toEqual([`chrome-extension://${stagingId}`]);
    // No other environment's Connect or log origin is bound into a staging build.
    expect(extensionHostPermissions(environment)).toEqual([
      "https://connect-staging.mdbase.dev/*",
      "https://log-staging.mdbase.dev/*",
      "https://*/*",
    ]);
  });

  it("refuses staging without an explicit, valid, staging-only extension ID", () => {
    expect(() => extensionEnvironment({ MDBASE_ENV: "staging" })).toThrow(/staging/u);
    expect(() =>
      extensionEnvironment({ MDBASE_ENV: "staging", MDBASE_EXTENSION_STAGING_ID: "not-an-id" }),
    ).toThrow();
    expect(() =>
      extensionEnvironment({
        MDBASE_ENV: "production",
        MDBASE_EXTENSION_STAGING_ID: stagingId,
      }),
    ).toThrow(/staging/u);
    expect(() => extensionEnvironment({ MDBASE_EXTENSION_STAGING_ID: stagingId })).toThrow(
      /staging/u,
    );
    // The Web Store (production) ID never becomes the staging identity.
    expect(() =>
      extensionEnvironment({
        MDBASE_ENV: "staging",
        MDBASE_EXTENSION_STAGING_ID: "kimdfjefhbfgfecconmaiaaindjccidp",
      }),
    ).toThrow();
  });

  it("does not widen omitted collection access when assembling an extension manifest", () => {
    expect(() =>
      extensionMdbaseManifest(
        { manifest_version: 1, homepage: "https://reader.mdbase.dev/" },
        extensionEnvironment({}),
      ),
    ).toThrow(/requirements\/access/u);
  });

  it("declares installation origins under the build's exact environment", () => {
    const reader = JSON.parse(
      readFileSync(new URL("../../reader/src/generated/mdbase-app.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;
    expect(extensionMdbaseManifest(reader, extensionEnvironment({})).installation_origins).toEqual({
      lab: { "app-runtime": ["chrome-extension://kimdfjefhbfgfecconmaiaaindjccidp"] },
    });
    expect(
      extensionMdbaseManifest(
        reader,
        extensionEnvironment({
          MDBASE_ENV: "staging",
          MDBASE_EXTENSION_STAGING_ID: stagingId,
        }),
      ).installation_origins,
    ).toEqual({ staging: { "app-runtime": [`chrome-extension://${stagingId}`] } });
    expect(
      extensionMdbaseManifest(reader, extensionEnvironment({ MDBASE_ENV: "production" }))
        .installation_origins,
    ).toEqual({
      production: { "app-runtime": ["chrome-extension://kimdfjefhbfgfecconmaiaaindjccidp"] },
    });
  });
});

describe("extension manifest details", () => {
  it("targets production without an environment label", () => {
    const environment = extensionEnvironment({ MDBASE_ENV: "production" });
    expect(environment.label).toBe("");
    expect(environment.logUrl).toBe("https://log.mdbase.dev");
    expect(environment.loopbackUrl).toBe("");
    expect(extensionManifest(environment)).toMatchObject({
      name: "mdbase Reader",
      host_permissions: ["https://connect.mdbase.dev/*", "https://log.mdbase.dev/*", "https://*/*"],
    });
  });

  it("declares one window-wide side panel, shortcuts and no tab list access", () => {
    const manifest = extensionManifest(extensionEnvironment({}));
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
