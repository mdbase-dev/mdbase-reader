import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { formatManifestValidationIssues, validateAppManifest } from "@mdbase-dev/sdk/manifest";

/** The SDK canonical schema and semantic origin checks for web and extension. */
export function assertValidReaderManifest(manifest, { allowLocal = false } = {}) {
  const validation = validateAppManifest(manifest, { allowLocal });
  if (!validation.valid) {
    throw new Error(
      `Application manifest is invalid: ${formatManifestValidationIssues(validation.issues)}`,
    );
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.dirname, "validate-manifest.mjs");
if (isMain) {
  const arguments_ = process.argv.slice(2);
  const paths = arguments_.filter((argument) => argument !== "--allow-local");
  if (paths.length !== 1 || paths[0].startsWith("-")) {
    throw new Error("Usage: node scripts/validate-manifest.mjs <mdbase-app.json> [--allow-local]");
  }
  assertValidReaderManifest(JSON.parse(await readFile(paths[0], "utf8")), {
    allowLocal: arguments_.includes("--allow-local"),
  });
}
