import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { formatValidationIssues, validateAppManifest } from "@mdbase-dev/connect-dev";

import { readerInstallationOrigins } from "./reader-manifest.mjs";

/**
 * Validates the generated manifest. The legacy connect-dev schema predates
 * `installation_origins` (the native CP schema declares exact lab, staging and
 * production policies), so that one field is checked here against the deployment
 * table and the rest of the manifest keeps the legacy validation unchanged.
 */
export function assertValidReaderManifest(manifest) {
  const { installation_origins: installationOrigins, ...legacyManifest } = manifest;
  const validation = validateAppManifest(legacyManifest);
  if (!validation.valid) {
    throw new Error(`Reader manifest is invalid: ${formatValidationIssues(validation.issues)}`);
  }
  if (JSON.stringify(installationOrigins) !== JSON.stringify(readerInstallationOrigins())) {
    throw new Error(
      "Reader manifest installation_origins do not declare the exact per-environment origins.",
    );
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.dirname, "validate-manifest.mjs");
if (isMain) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    throw new Error("Usage: node scripts/validate-manifest.mjs <mdbase-app.json>");
  }
  assertValidReaderManifest(JSON.parse(await readFile(manifestPath, "utf8")));
}
