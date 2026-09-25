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
  };
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
    version: "0.2.0",
    homepage_url: `${environment.readerOrigin}/`,
    icons,
    minimum_chrome_version: "123",
    permissions: ["activeTab", "scripting", "storage", "contextMenus", "sidePanel"],
    // Only the Connect API is permanent. Page status on every site is an explicit opt-in.
    host_permissions: [`${environment.connectUrl}/*`],
    optional_host_permissions: ["https://*/*"],
    action: {
      default_title: `Save to mdbase Reader${suffix}`,
      default_icon: { 16: icons["16"], 32: icons["32"] },
    },
    background: { service_worker: "background.js", type: "module" },
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
