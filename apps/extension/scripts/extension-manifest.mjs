import { readFileSync } from "node:fs";

import { readerDeploymentFor } from "../../reader/scripts/deployment-environment.mjs";

/**
 * The extension targets exactly one mdbase environment, chosen at build time with
 * `MDBASE_ENV` (lab by default), like Reader's own deployments.
 */
export function extensionEnvironment(environment = process.env) {
  const { target, deployment } = readerDeploymentFor(environment);
  return {
    target,
    label: target === "production" ? "" : target.toUpperCase(),
    connectUrl: deployment.connectUrl,
    loopbackUrl: deployment.loopbackUrl,
    readerOrigin: deployment.origin,
    // Opt-in mdbase-next SDK backend (MDBASE_SDK=next); Connect stays the default.
    sdk: environment.MDBASE_SDK === "next" ? "next" : "connect",
  };
}

const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

/**
 * Chrome versions are one to four dot-separated integers, so a prerelease such as
 * `0.3.0-beta.1` ships as version `0.3.0` and shows its full name as `version_name`.
 */
export function manifestVersion(version = packageVersion) {
  const match = /^(\d+\.\d+\.\d+)(?:-(.+))?$/u.exec(version);
  if (!match) {
    throw new Error(`Unsupported extension version: ${version}`);
  }
  return match[2] ? { version: match[1], version_name: version } : { version: match[1] };
}

const icons = Object.fromEntries(
  [16, 32, 48, 128].map((size) => [String(size), `icons/icon-${size}.png`]),
);

export function extensionManifest(environment) {
  const suffix = environment.label ? ` (${environment.label})` : "";
  const loopback = new URL(environment.loopbackUrl);
  return {
    manifest_version: 3,
    name: `mdbase Reader${suffix}`,
    description: "Save the page you are reading and revisit your mdbase annotations.",
    ...manifestVersion(),
    homepage_url: `${environment.readerOrigin}/`,
    icons,
    minimum_chrome_version: "123",
    permissions: ["activeTab", "scripting", "storage", "contextMenus", "sidePanel"],
    // The Connect API, and HTTPS pages: the side panel follows the active tab and saved
    // pages are marked, which needs to read each page without a click on the toolbar.
    host_permissions: [`${environment.connectUrl}/*`, "https://*/*"],
    optional_host_permissions: [`${loopback.protocol}//${loopback.hostname}/*`],
    action: {
      default_title: `Save to mdbase Reader${suffix}`,
      default_icon: { 16: icons["16"], 32: icons["32"] },
    },
    // One panel per window; it follows the window's active tab.
    side_panel: { default_path: "capture.html" },
    // Classic, not a module: it loads page-status.js with importScripts() on demand.
    background: { service_worker: "background.js" },
    options_ui: { page: "options.html", open_in_tab: true },
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+S" },
        description: "Open mdbase Reader for this page",
      },
      "save-highlight": {
        suggested_key: { default: "Alt+Shift+H" },
        description: "Highlight the selected passage in mdbase Reader",
      },
    },
  };
}
