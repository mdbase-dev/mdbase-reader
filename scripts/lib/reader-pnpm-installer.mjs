// Co100025: pnpm-generated wrappers are tooling, NOT SDK-original authority.
// ALL original package/YAML files still match independently. Only the known
// wrapper location is separate; no blanket .bin ignore, deletion or execution.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
export const pnpmYamlShim = "node_modules/.bin/yaml";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const check = (ok, reason) => {
  if (!ok) throw Error("Reader installer-output refusal: " + reason);
};
const versions = new Map();
export function assertReaderPnpmVersion(repoRoot, packageManager) {
  check(packageManager === "pnpm@10.7.0", "Reader source package manager must be pinned 10.7.0");
  if (!versions.has(repoRoot))
    versions.set(
      repoRoot,
      execFileSync("pnpm", ["--version"], {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 10000,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NPM_CONFIG_USERCONFIG: "/dev/null",
          NPM_CONFIG_GLOBALCONFIG: "/dev/null",
        },
      }).trim(),
    );
  const version = versions.get(repoRoot);
  check(version === "10.7.0", "actual installer is not PNPM10.7.0");
  return version;
}
function canonicalRoot(repoRoot, packageRoot, name) {
  check(
    typeof repoRoot === "string" &&
      typeof packageRoot === "string" &&
      /^\/[A-Za-z0-9_./@+~-]+$/.test(repoRoot) &&
      /^\/[A-Za-z0-9_./@+~-]+$/.test(packageRoot),
    "unsafe/noncanonical POSIX roots",
  );
  check(
    resolve(repoRoot) === repoRoot &&
      resolve(packageRoot) === packageRoot &&
      !relative(join(repoRoot, "node_modules/.pnpm"), packageRoot).startsWith("..") &&
      packageRoot.endsWith("/node_modules/" + name),
    "unexpected PNPM installed package root",
  );
}
function originalYaml(yamlPackageBytes, originalMembers) {
  const yaml = originalMembers.filter((m) => m.path.startsWith("node_modules/yaml/"));
  const pkg = yaml.find((m) => m.path === "node_modules/yaml/package.json");
  check(
    pkg &&
      yaml.some((m) => m.path === "node_modules/yaml/bin.mjs") &&
      hash(yamlPackageBytes) === pkg.sha256 &&
      yamlPackageBytes.length === pkg.bytes,
    "original YAML package/bin binding",
  );
  const manifest = JSON.parse(yamlPackageBytes);
  check(
    manifest.name === "yaml" &&
      manifest.bin === "./bin.mjs" &&
      /^\d+\.\d+\.\d+$/.test(manifest.version),
    "original YAML package/version/bin target",
  );
  return { yaml, manifest };
}
function evidence(bytes, count) {
  return {
    path: pnpmYamlShim,
    bytes: bytes.length,
    sha256: hash(bytes),
    manager: "pnpm@10.7.0",
    policy: "pnpm-generated wrapper; separately verified ALL original package/YAML members",
    originalYamlMembers: count,
    targetOriginal: "node_modules/yaml/bin.mjs",
    disposition:
      "retained as pnpm-generated tooling; never counted as package original, SDK authority or executed",
  };
}
export function verifyReaderYamlShim({
  repoRoot,
  sdkRoot,
  managerVersion,
  bytes,
  yamlPackageBytes,
  originalMembers,
}) {
  check(managerVersion === "10.7.0", "unqualified installer version");
  const { yaml } = originalYaml(yamlPackageBytes, originalMembers);
  canonicalRoot(repoRoot, sdkRoot, "@mdbase-dev/sdk");
  return evidence(bytes, yaml.length);
}
export function verifyReaderProtocolYamlShim({
  repoRoot,
  protocolRoot,
  yamlRoot,
  managerVersion,
  bytes,
  yamlPackageBytes,
  originalSdkMembers,
}) {
  check(managerVersion === "10.7.0", "unqualified installer version");
  const { yaml, manifest } = originalYaml(yamlPackageBytes, originalSdkMembers);
  check(
    yamlRoot === join(repoRoot, `node_modules/.pnpm/yaml@${manifest.version}/node_modules/yaml`),
    "direct protocol YAML location/version differs from original SDK YAML",
  );
  canonicalRoot(repoRoot, protocolRoot, "@mdbase-dev/connect-protocol");
  canonicalRoot(repoRoot, yamlRoot, "yaml");
  return evidence(bytes, yaml.length);
}
