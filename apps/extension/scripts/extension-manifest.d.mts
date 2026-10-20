import type { ExtensionEnvironment } from "../src/environment.js";

export function extensionEnvironment(
  environment?: Readonly<Record<string, string | undefined>>,
): ExtensionEnvironment;
export function manifestVersion(version?: string): {
  version: string;
  version_name?: string;
};
export function extensionHostPermissions(environment: ExtensionEnvironment): string[];
export function extensionManifest(environment: ExtensionEnvironment): Record<string, unknown>;
export function extensionMdbaseManifest(
  reader: Record<string, unknown>,
  environment: ExtensionEnvironment,
): Record<string, unknown> & {
  installation_origins: Record<string, { "app-runtime": readonly string[] }>;
};
export const storeExtensionId: string;
