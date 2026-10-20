// Reader-owned PNPM10.7.0 installer-output policy, NOT an SDK-original exception.
// ALL original package/YAML files are compared independently BEFORE qualifying
// these exact generated files. No blanket .bin ignore, deletion or execution.
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
function render(paths, target) {
  return Buffer.from(
    [
      "#!/bin/sh",
      String.raw`basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")`,
      "",
      "case `uname` in",
      '    *CYGWIN*) basedir=`cygpath -w "$basedir"`;;',
      "esac",
      "",
      'if [ -z "$NODE_PATH" ]; then',
      `  export NODE_PATH="${paths.join(":")}"`,
      "else",
      `  export NODE_PATH="${paths.join(":")}:$NODE_PATH"`,
      "fi",
      'if [ -x "$basedir/node" ]; then',
      `  exec "$basedir/node"  "$basedir/${target}" "$@"`,
      "else",
      `  exec node  "$basedir/${target}" "$@"`,
      "fi",
      "",
    ].join("\n"),
  );
}
export function pnpm107YamlTemplate(repoRoot, sdkRoot) {
  canonicalRoot(repoRoot, sdkRoot, "@mdbase-dev/sdk");
  return render(
    [
      join(sdkRoot, "node_modules/yaml/node_modules"),
      join(sdkRoot, "node_modules"),
      join(sdkRoot, "../node_modules"),
      resolve(sdkRoot, "../.."),
      join(repoRoot, "node_modules/.pnpm/node_modules"),
    ],
    "../yaml/bin.mjs",
  );
}
export function pnpm107ProtocolYamlTemplate(repoRoot, protocolRoot, yamlRoot) {
  canonicalRoot(repoRoot, protocolRoot, "@mdbase-dev/connect-protocol");
  canonicalRoot(repoRoot, yamlRoot, "yaml");
  return render(
    [
      join(yamlRoot, "node_modules"),
      resolve(yamlRoot, ".."),
      join(repoRoot, "node_modules/.pnpm/node_modules"),
    ],
    "../../../../yaml/bin.mjs",
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
    policy: "exact POSIX template + separately verified ALL original package/YAML members",
    originalYamlMembers: count,
    targetOriginal: "node_modules/yaml/bin.mjs",
    disposition:
      "retained as independently verified installer output; never counted as package original or executed",
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
  const expected = pnpm107YamlTemplate(repoRoot, sdkRoot);
  check(
    bytes.length === expected.length && bytes.equals(expected),
    "generated SDK YAML shim differs from exact pinned PNPM template",
  );
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
  const expected = pnpm107ProtocolYamlTemplate(repoRoot, protocolRoot, yamlRoot);
  check(
    bytes.length === expected.length && bytes.equals(expected),
    "generated protocol YAML shim differs from exact pinned PNPM template",
  );
  return evidence(bytes, yaml.length);
}
