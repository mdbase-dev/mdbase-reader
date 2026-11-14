import {
  sdkApplicationEnvironment,
  type MdbaseApplicationDeclaration,
  type SdkApplicationEnvironment,
} from "@mdbase-reader/connect/native";

import { environment } from "./environment.js";
import manifest from "./generated/mdbase-app.json";

declare const __READER_EXTENSION_SESSION_BUILD__: string;

/** Identical in every bundle of this package, different after a rebuild. */
export const sessionBuild = __READER_EXTENSION_SESSION_BUILD__;

/**
 * This build's exact SDK environment, shared with Reader's native entry.
 */
export function sdkEnvironment(
  target: SdkApplicationEnvironment = environment.target,
): MdbaseApplicationDeclaration["environment"] {
  return sdkApplicationEnvironment(target);
}

/**
 * The extension's declaration: its own origin (the Web Store ID, or an unpacked build's ID
 * when that build declares it) and the extension manifest that lists that origin under
 * `installation_origins`.
 */
export function extensionDeclaration(
  runtimeId: string = chrome.runtime.id,
): MdbaseApplicationDeclaration {
  return {
    id: manifest.id,
    name: manifest.name,
    origin: `chrome-extension://${runtimeId}`,
    environment: sdkEnvironment(),
    installationKind: "app-runtime",
    manifest,
  };
}
