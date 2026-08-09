import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoots = ["packages", "apps"];
const allowedInternalDependencies = new Map([
  ["@mdbase-reader/core", new Set()],
  ["@mdbase-reader/reading-surface", new Set(["@mdbase-reader/core"])],
  ["@mdbase-reader/connect", new Set(["@mdbase-reader/core"])],
  [
    "@mdbase-reader/renderer-pdf",
    new Set(["@mdbase-reader/core", "@mdbase-reader/reading-surface"]),
  ],
  [
    "@mdbase-reader/renderer-epub",
    new Set(["@mdbase-reader/core", "@mdbase-reader/reading-surface"]),
  ],
  ["@mdbase-reader/markdown-editor", new Set(["@mdbase-reader/core"])],
  ["@mdbase-reader/platform", new Set(["@mdbase-reader/core"])],
  ["@mdbase-reader/ui", new Set()],
  ["@mdbase-reader/testkit", new Set(["@mdbase-reader/core", "@mdbase-reader/reading-surface"])],
  [
    "@mdbase-reader/app",
    new Set([
      "@mdbase-reader/core",
      "@mdbase-reader/connect",
      "@mdbase-reader/reading-surface",
      "@mdbase-reader/renderer-pdf",
      "@mdbase-reader/renderer-epub",
      "@mdbase-reader/markdown-editor",
      "@mdbase-reader/platform",
      "@mdbase-reader/ui",
    ]),
  ],
  ["@mdbase-reader/electron", new Set(["@mdbase-reader/platform"])],
  ["@mdbase-reader/capacitor", new Set(["@mdbase-reader/platform"])],
]);

const packageFiles = [];
for (const packageRoot of packageRoots) {
  const entries = await readdir(resolve(root, packageRoot), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      packageFiles.push(resolve(root, packageRoot, entry.name, "package.json"));
    }
  }
}

const problems = [];
for (const packageFile of packageFiles) {
  const manifest = JSON.parse(await readFile(packageFile, "utf8"));
  const allowed = allowedInternalDependencies.get(manifest.name);
  if (!allowed) {
    problems.push(`Unregistered workspace package: ${manifest.name}`);
    continue;
  }

  const dependencies = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  };
  for (const dependency of Object.keys(dependencies)) {
    if (dependency.startsWith("@mdbase-reader/") && !allowed.has(dependency)) {
      problems.push(`${manifest.name} must not depend on ${dependency}`);
    }
  }
}

if (problems.length > 0) {
  throw new Error(
    `Architecture check failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
  );
}

console.log(`Architecture verified across ${packageFiles.length} workspace packages.`);
