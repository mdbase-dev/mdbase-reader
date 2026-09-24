import type { ExtensionEnvironment } from "../src/environment.js";

export function extensionEnvironment(
  environment?: Readonly<Record<string, string | undefined>>,
): ExtensionEnvironment;
export function extensionManifest(environment: ExtensionEnvironment): Record<string, unknown>;
