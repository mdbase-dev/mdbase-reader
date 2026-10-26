// Environment-specific originals stay installed side by side. Never rewrite consumer pins.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { originalMembers } from "../../../scripts/lib/native-originals.mjs";
import { readerDeployments } from "./deployment-environment.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const vendor = "packages/connect/vendor/";
const pins = {
  lab: ["@mdbase-dev/sdk-lab", "sdk-lab-eaa4e697.json"],
  staging: ["@mdbase-dev/sdk-staging", "sdk-staging-eaa4e697.json"],
  production: ["@mdbase-dev/sdk", "sdk-production-beta141.json"],
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function readerSdkTarget(environment) {
  const selectors = [
    environment.VITE_MDBASE_ENV,
    environment.MDBASE_ENV,
    environment.MDBASE_READER_DEPLOY_TARGET,
  ].filter((value) => value !== undefined);
  const target = selectors[0] ?? "production";
  assert.ok(Object.hasOwn(pins, target), "Unsupported Reader SDK environment: " + target);
  assert.ok(
    selectors.every((value) => value === target),
    "Conflicting Reader SDK environments",
  );
  const expected = readerDeployments[target].connectUrl;
  for (const url of [environment.VITE_MDBASE_CONNECT_URL, environment.MDBASE_CONNECT_URL]) {
    assert.ok(url === undefined || url === expected, "Reader SDK Connect origin mismatch");
  }
  return target;
}

/** Verify archive identity AND every installed original before importing any SDK build code.
 * `app` is the consuming workspace (Reader or its browser extension), which installs all three
 * originals side by side. The standard native publisher retains its separate, stronger
 * authentication/admission gates. */
export async function verifiedReaderSdk(target, repoRoot = root, app = "apps/reader") {
  assert.ok(Object.hasOwn(pins, target), "Unsupported Reader SDK environment: " + target);
  const [name, manifest] = pins[target];
  const pin = JSON.parse(await readFile(join(repoRoot, vendor, manifest), "utf8"));
  const archive = join(repoRoot, vendor, pin.artifact);
  const bytes = await readFile(archive);
  assert.equal(bytes.length, pin.bytes, "Reader SDK archive length mismatch");
  assert.equal(hash(bytes), pin.sha256, "Reader SDK archive hash mismatch");
  const sdkRoot = await realpath(join(repoRoot, app, "node_modules", name));
  // This reader uses only regular, original SDK files, not consumer-side patches.
  for (const member of originalMembers(archive)) {
    const path = join(sdkRoot, member.path);
    assert.ok((await lstat(path)).isFile(), "Nonregular installed SDK member: " + member.path);
    assert.equal(await realpath(path), path, "Symlinked installed SDK member: " + member.path);
    const installed = await readFile(path);
    assert.equal(installed.length, member.bytes, "Installed SDK length mismatch: " + member.path);
    assert.equal(hash(installed), member.sha256, "Installed SDK hash mismatch: " + member.path);
  }
  const metadata = await readFile(join(sdkRoot, "dist/application/packaged-trust.js"), "utf8");
  const match = /^const metadata = (\{.*\});$/m.exec(metadata);
  assert.ok(match, "Unknown SDK packaged-trust format");
  const release = JSON.parse(match[1]);
  const provenance = JSON.parse(
    await readFile(join(sdkRoot, "dist/native/provenance.json"), "utf8"),
  );
  assert.equal(pin.environment, target, "Reader SDK manifest environment mismatch");
  assert.equal(provenance.environment, target, "Reader SDK provenance environment mismatch");
  assert.equal(release.environment, target, "Reader SDK packaged environment mismatch");
  assert.equal(
    release.cpOrigin,
    readerDeployments[target].connectUrl,
    "Reader SDK packaged origin mismatch",
  );
  assert.deepEqual(
    provenance.trust,
    pin.trust ?? pin.provenance.trust,
    "Reader SDK trust differs from intake provenance",
  );
  assert.equal(provenance.trust.environment, release.environment);
  assert.equal(provenance.trust.cpOrigin, release.cpOrigin);
  assert.equal(provenance.trust.logOrigin, release.logOrigin);
  assert.equal(provenance.trust.sha256, release.assetSha256);
  const pkg = JSON.parse(await readFile(join(sdkRoot, "package.json"), "utf8"));
  const aliases = Object.entries(pkg.exports).map(([key, value]) => ({
    find: key === "." ? "@mdbase-dev/sdk" : "@mdbase-dev/sdk" + key.slice(1),
    replacement: resolve(sdkRoot, value.import),
  }));
  // Exact matches only: never alias sdk-legacy-* and never fall back to another environment.
  return {
    aliases: aliases.map(({ find, replacement }) => ({
      find: new RegExp("^" + find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
      replacement,
    })),
    offlineShellUrl: pathToFileURL(join(sdkRoot, "dist/offline-shell-build.js")).href,
    receipt: {
      environment: target,
      cpOrigin: release.cpOrigin,
      artifact: pin.artifact,
      sha256: pin.sha256,
    },
  };
}
