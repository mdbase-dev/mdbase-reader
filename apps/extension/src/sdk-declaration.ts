import { environment } from "./environment.js";
import manifest from "./generated/mdbase-app.json";

import type { MdbaseApplicationDeclaration } from "@mdbase-reader/connect/native";

/** This build's environment as the SDK names it; staging has no SDK environment. */
export function sdkEnvironment(): MdbaseApplicationDeclaration["environment"] {
  return environment.target === "lab" ? "lab" : "production";
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
