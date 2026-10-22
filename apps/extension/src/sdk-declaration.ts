import {
  sdkApplicationEnvironment,
  type MdbaseApplicationDeclaration,
  type SdkApplicationEnvironment,
} from "@mdbase-reader/connect/native";

import { environment } from "./environment.js";
import manifest from "./generated/mdbase-app.json";

/**
 * This build's environment as the SDK names it: the exact build environment,
 * never mapped to another. The pinned SDK's types predate mdbase-next PR #941;
 * `sdkApplicationEnvironment` is the one adapter (see packages/connect).
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
