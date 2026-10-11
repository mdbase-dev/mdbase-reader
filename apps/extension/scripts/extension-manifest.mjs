import { readFileSync } from "node:fs";

import { readerDeploymentFor } from "../../reader/scripts/deployment-environment.mjs";

/** The Chrome Web Store build's ID; its origin is what Connect registers for the extension. */
export const storeExtensionId = "kimdfjefhbfgfecconmaiaaindjccidp";

/**
 * The SDK's log service for each environment, which the extension reaches from its pages.
 * Production has no SDK release trust yet, so it has no log origin to declare.
 */
const sdkLogOrigins = Object.freeze({
  lab: "https://mdbase-next-log-lab-20261005.callumalpass.workers.dev",
});

const chromeExtensionId = /^[a-p]{32}$/u;

/**
 * The extension targets exactly one mdbase environment, chosen at build time with
 * `MDBASE_ENV` (lab by default), like Reader's own deployments. A LAB build may also
 * declare an unpacked build's ID (`MDBASE_EXTENSION_DEV_ID`, from chrome://extensions)
 * so that build can register with LAB; other targets only declare the Web Store ID.
 */
export function extensionEnvironment(environment = process.env) {
  const { target, deployment } = readerDeploymentFor(environment);
  const devId = environment.MDBASE_EXTENSION_DEV_ID;
  if (devId && (target !== "lab" || !chromeExtensionId.test(devId))) {
    throw new Error("MDBASE_EXTENSION_DEV_ID must be a Chrome extension ID, for LAB builds only.");
  }
  return {
    target,
    label: target === "production" ? "" : target.toUpperCase(),
    connectUrl: deployment.connectUrl,
    logUrl: sdkLogOrigins[target] ?? null,
    loopbackUrl: deployment.loopbackUrl,
    readerOrigin: deployment.origin,
    extensionOrigins: [
      storeExtensionId,
      ...(devId && devId !== storeExtensionId ? [devId] : []),
    ].map((id) => `chrome-extension://${id}`),
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
  return {
    manifest_version: 3,
    name: `mdbase Reader${suffix}`,
    description: "Save the page you are reading and revisit your mdbase annotations.",
    ...manifestVersion(),
    homepage_url: `${environment.readerOrigin}/`,
    icons,
    minimum_chrome_version: "123",
    permissions: ["activeTab", "scripting", "storage", "contextMenus", "sidePanel", "offscreen"],
    // The mdbase control plane and log service the SDK talks to from the extension's
    // pages, and HTTPS pages: the side panel follows the active tab and saved pages are
    // marked, which needs to read each page without a click on the toolbar.
    host_permissions: [
      `${environment.connectUrl}/*`,
      ...(environment.logUrl ? [`${environment.logUrl}/*`] : []),
      "https://*/*",
    ],
    // The SDK's native runtime is WebAssembly.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    action: {
      default_title: `Save to mdbase Reader${suffix}`,
      default_icon: { 16: icons["16"], 32: icons["32"] },
    },
    // One panel per window; it follows the window's active tab.
    side_panel: { default_path: "capture.html" },
    // Classic, with no SDK: the SDK runtime lives in the extension's pages.
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
