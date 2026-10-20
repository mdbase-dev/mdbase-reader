import { readFileSync } from "node:fs";

import { readerDeploymentFor } from "../../reader/scripts/deployment-environment.mjs";
import { assertValidReaderManifest } from "../../reader/scripts/validate-manifest.mjs";

import { stagingExtensionId, stagingManifestKey } from "./staging-public-key.mjs";

/** The Chrome Web Store build's ID; its origin is what Connect registers for the extension. */
export const storeExtensionId = "kimdfjefhbfgfecconmaiaaindjccidp";

/**
 * The SDK's log service for each environment, which the extension reaches from its
 * pages. Each value comes from the authenticated release trust bundled in that
 * environment's pinned SDK archive (LAB matches the current pin's trust); staging
 * and production have no SDK release trust yet, so they declare no log origin
 * rather than reusing another environment's.
 */
const sdkLogOrigins = Object.freeze({
  lab: "https://mdbase-next-log-lab-20261005.callumalpass.workers.dev",
});

const chromeExtensionId = /^[a-p]{32}$/u;

/**
 * The extension targets exactly one mdbase environment, chosen at build time with
 * `MDBASE_ENV` (lab by default), like Reader's own deployments. A LAB build may also
 * declare an unpacked build's ID (`MDBASE_EXTENSION_DEV_ID`, from chrome://extensions)
 * so that build can register with LAB. Staging is an unpacked build, not a store
 * channel: it declares only its own approved ID, named explicitly with
 * `MDBASE_EXTENSION_STAGING_ID`, and refuses to build without one. Production
 * declares only the Web Store ID.
 */
export function extensionEnvironment(environment = process.env) {
  const { target, deployment } = readerDeploymentFor(environment);
  const devId = environment.MDBASE_EXTENSION_DEV_ID;
  if (devId && (target !== "lab" || !chromeExtensionId.test(devId))) {
    throw new Error("MDBASE_EXTENSION_DEV_ID must be a Chrome extension ID, for LAB builds only.");
  }
  const stagingId = environment.MDBASE_EXTENSION_STAGING_ID;
  if (target === "staging") {
    if (!stagingId || !chromeExtensionId.test(stagingId) || stagingId !== stagingExtensionId) {
      throw new Error(
        "Staging extension builds require MDBASE_EXTENSION_STAGING_ID: the approved staging build's own Chrome extension ID (not the Web Store ID).",
      );
    }
  } else if (stagingId) {
    throw new Error("MDBASE_EXTENSION_STAGING_ID is for staging builds only.");
  }
  const stagingPublicKey = environment.MDBASE_EXTENSION_STAGING_PUBLIC_KEY;
  if (target !== "staging" && stagingPublicKey) {
    throw new Error("MDBASE_EXTENSION_STAGING_PUBLIC_KEY is for staging builds only.");
  }
  const extensionIds =
    target === "staging"
      ? [stagingId]
      : [storeExtensionId, ...(devId && devId !== storeExtensionId ? [devId] : [])];
  return {
    target,
    label: target === "production" ? "" : target.toUpperCase(),
    connectUrl: deployment.connectUrl,
    logUrl: sdkLogOrigins[target] ?? null,
    loopbackUrl: deployment.loopbackUrl,
    readerOrigin: deployment.origin,
    extensionOrigins: extensionIds.map((id) => `chrome-extension://${id}`),
    ...(target === "staging" && stagingPublicKey ? { stagingPublicKey } : {}),
  };
}

/**
 * The extension's mdbase manifest: a web app manifest whose pages are the
 * extension's. Connect registers the extension's exact chrome-extension origins
 * under `installation_origins` for this build's exact environment — never under
 * another environment's name.
 */
export function extensionMdbaseManifest(reader, environment) {
  const manifest = {
    ...reader,
    id: "dev.mdbase.reader.extension",
    name: "mdbase Reader browser extension",
    homepage: `${environment.readerOrigin}/`,
    icon: `${environment.readerOrigin}/favicon.svg`,
    redirect_uris: [`${environment.readerOrigin}/`],
    installation_origins: {
      [environment.target]: { "app-runtime": environment.extensionOrigins },
    },
  };
  assertValidReaderManifest(manifest);
  return manifest;
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

export function extensionHostPermissions(environment) {
  return [
    `${environment.connectUrl}/*`,
    ...(environment.logUrl ? [`${environment.logUrl}/*`] : []),
    "https://*/*",
  ];
}

export function extensionManifest(environment) {
  // A declared origin alone cannot set an unpacked Chrome extension ID. Require
  // its matching PUBLIC key in the Chrome manifest, never the keyring private key.
  const key =
    environment.target === "staging" ? stagingManifestKey(environment.stagingPublicKey) : undefined;
  const suffix = environment.label ? ` (${environment.label})` : "";
  return {
    manifest_version: 3,
    ...(key ? { key } : {}),
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
    host_permissions: extensionHostPermissions(environment),
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
