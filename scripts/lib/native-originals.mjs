// OFF-CI NX-TRUST/TNAPP authenticate once. CI binds original bytes only.
// Canonical producer packet: nx-tnapp-public-target-sdk-verification-inputs.md.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  assertReaderPnpmVersion,
  pnpmYamlShim,
  verifyReaderYamlShim,
  verifyReaderProtocolYamlShim,
} from "./reader-pnpm-installer.mjs";
const hash = (bytes, algorithm = "sha256") =>
  createHash(algorithm)
    .update(bytes)
    .digest(algorithm === "sha512" ? "base64" : "hex");
const requireValue = (ok, reason) => {
  if (!ok) throw Error(`Refusing native originals: ${reason}`);
};
const equal = (a, b, reason) => {
  if (
    !isDeepStrictEqual(a, b) &&
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.every((r) => r.path) &&
    b.every((r) => r.path)
  ) {
    const actual = new Map(a.map((r) => [r.path, r])),
      expected = new Map(b.map((r) => [r.path, r]));
    const differences = [...new Set([...actual.keys(), ...expected.keys()])].filter(
      (p) => !isDeepStrictEqual(actual.get(p), expected.get(p)),
    );
    throw Error(
      `Refusing native originals: ${reason}; differences: ${differences
        .slice(0, 12)
        .map(
          (p) =>
            `${p}(${actual.has(p) ? "installed" : "missing"}/${expected.has(p) ? "original" : "extra"})`,
        )
        .join(", ")}`,
    );
  }
  requireValue(isDeepStrictEqual(a, b), reason);
};
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const packages = {
  sdk: "@mdbase-dev/sdk",
  ui: "@mdbase-dev/ui",
  protocol: "@mdbase-dev/connect-protocol",
};
export const digestNames = [
  "NATIVE_SDK_SHA256",
  "NATIVE_UI_SHA256",
  "NATIVE_PROTOCOL_SHA256",
  "NATIVE_TRUST_ASSET_SHA256",
];
export function protectedHashes(env = process.env) {
  const hashes = Object.fromEntries(digestNames.map((name) => [name, env[name]]));
  requireValue(
    Object.values(hashes).every((value) => /^[a-f0-9]{64}$/.test(value ?? "")),
    "four protected per-environment original SHA256 values required",
  );
  return hashes;
}
async function regular(root, name) {
  requireValue(
    typeof name === "string" &&
      name.split("/").every((p) => /^[\w.@~-]+$/.test(p) && p !== "." && p !== ".."),
    "unsafe input path",
  );
  const path = join(root, name);
  requireValue(
    (await lstat(path)).isFile() && (await realpath(path)) === path,
    "input symlink/nonregular file",
  );
  return readFile(path);
}
export function originalMembers(archive) {
  return JSON.parse(
    execFileSync(
      "python3",
      ["-B", fileURLToPath(new URL("./archive-members.py", import.meta.url)), archive],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    ),
  );
}
function memberBytes(archive, members, path) {
  requireValue(
    members.some((m) => m.path === path),
    `missing original ${path}`,
  );
  return execFileSync("tar", ["-xOzf", archive, `package/${path}`], {
    maxBuffer: 128 * 1024 * 1024,
  });
}
async function installedMembers(root) {
  const out = [];
  async function walk(directory, prefix = "") {
    for (const name of await readdir(directory)) {
      const path = join(directory, name),
        rel = prefix + name,
        stat = await lstat(path);
      requireValue(!stat.isSymbolicLink(), `installed member symlink ${rel}`);
      if (stat.isDirectory()) await walk(path, rel + "/");
      else {
        requireValue(stat.isFile(), `nonregular installed member ${rel}`);
        requireValue(
          stat.size <= 128 * 1024 * 1024 && out.length < 10000,
          "installed member limits",
        );
        const bytes = await readFile(path);
        out.push({ path: rel, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}
export async function assertInstalledOriginals(
  root,
  members,
  reason,
  {
    sdk = false,
    protocol = false,
    originalSdkRoot,
    originalSdkMembers,
    repoRoot,
    packageManager,
    installerEvidence = [],
  } = {},
) {
  const actual = await installedMembers(root),
    paths = new Set(members.map((m) => m.path));
  const extra = actual.filter((m) => !paths.has(m.path));
  if ((!sdk && !protocol) || extra.length !== 1 || extra[0].path !== pnpmYamlShim) {
    equal(actual, members, reason);
    return;
  }
  // ALL original SDK files (including every YAML file) still have to match.
  // Co100025: the sole known pnpm-generated wrapper is not an SDK original;
  // its program bytes are not classified. Other extra members still refuse.
  equal(
    actual.filter((m) => paths.has(m.path)),
    members,
    reason,
  );
  const stat = await lstat(join(root, pnpmYamlShim));
  requireValue(
    stat.isFile() && (stat.mode & 0o111) === 0o111 && (stat.mode & 0o7000) === 0,
    "unexpected generated shim type/mode",
  );
  const args = {
    repoRoot,
    managerVersion: assertReaderPnpmVersion(repoRoot, packageManager),
    bytes: await readFile(join(root, pnpmYamlShim)),
  };
  let evidence;
  if (sdk)
    evidence = verifyReaderYamlShim({
      ...args,
      sdkRoot: root,
      yamlPackageBytes: await readFile(join(root, "node_modules/yaml/package.json")),
      originalMembers: members,
    });
  else {
    requireValue(
      originalSdkRoot && Array.isArray(originalSdkMembers),
      "direct protocol original SDK/YAML binding required",
    );
    const yamlRoot = await realpath(resolve(root, "../../yaml"));
    requireValue(!relative(repoRoot, yamlRoot).startsWith(".."), "protocol YAML outside checkout");
    const expectedYaml = originalSdkMembers
      .filter((m) => m.path.startsWith("node_modules/yaml/"))
      .map((m) => ({ ...m, path: m.path.slice("node_modules/yaml/".length) }));
    equal(
      await installedMembers(yamlRoot),
      expectedYaml,
      "direct protocol ALL original YAML members differ",
    );
    requireValue(
      (await realpath(join(root, "node_modules/.bin/../../../../yaml/bin.mjs"))) ===
        join(yamlRoot, "bin.mjs"),
      "protocol shim target resolves outside original YAML",
    );
    evidence = verifyReaderProtocolYamlShim({
      ...args,
      protocolRoot: root,
      yamlRoot,
      yamlPackageBytes: await readFile(join(originalSdkRoot, "node_modules/yaml/package.json")),
      originalSdkMembers,
    });
  }
  equal(
    extra[0],
    { path: evidence.path, bytes: evidence.bytes, sha256: evidence.sha256 },
    "installer output changed during verification",
  );
  const packageRoot = relative(repoRoot, root);
  if (!installerEvidence.some((e) => e.packageRoot === packageRoot))
    installerEvidence.push({
      packageRoot,
      package: sdk ? "sdk" : "protocol",
      originalPackageMembers: members.length,
      originalSdkMembers: sdk ? members.length : originalSdkMembers.length,
      totalInstalledFiles: actual.length,
      ...evidence,
    });
}
export async function loadOriginals({
  target,
  repoRoot,
  hashes,
  installed = false,
  installerEvidence = [],
}) {
  requireValue(["staging", "production"].includes(target), "unknown target; no LAB retarget");
  protectedHashes(hashes);
  repoRoot = await realpath(repoRoot);
  const app = join(repoRoot, "apps/reader");
  const pkg = await json(join(app, "package.json"));
  const rootPkg = await json(join(repoRoot, "package.json"));
  requireValue(
    rootPkg.packageManager === "pnpm@10.7.0",
    "Reader installer policy requires pinned pnpm@10.7.0",
  );
  const installerOptions = { repoRoot, packageManager: rootPkg.packageManager, installerEvidence };
  const lockBytes = await regular(repoRoot, "pnpm-lock.yaml");
  const lock = lockBytes.toString();
  const archives = {},
    originals = {};
  for (const [key, name] of Object.entries(packages)) {
    const owner = key === "protocol" ? repoRoot : app;
    const pin = key === "protocol" ? rootPkg.devDependencies?.[name] : pkg.dependencies?.[name];
    requireValue(
      typeof pin === "string" && pin.startsWith("file:"),
      `${name} must remain a file pin`,
    );
    const path = relative(repoRoot, resolve(owner, pin.slice(5)));
    const bytes = await regular(repoRoot, path);
    const sha256 = hash(bytes),
      sri = `sha512-${hash(bytes, "sha512")}`;
    equal(
      sha256,
      hashes[`NATIVE_${key.toUpperCase()}_SHA256`],
      `${key} protected archive hash mismatch`,
    );
    // No package code/YAML module is loaded to inspect the frozen lock.
    const importerKey = key === "protocol" ? "." : "apps/reader";
    const importer = lock.split(`\n  ${importerKey}:\n`)[1]?.split(/\n {2}[^ ]/)[0];
    requireValue(
      importer?.includes(`'${name}':\n        specifier: ${pin}\n`),
      `${name} frozen importer pin mismatch`,
    );
    const escaped = `${name}@file:${path}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const resolution = new RegExp(
      `  '${escaped}':\\n    resolution: \\{integrity: ([^,]+), tarball: file:([^}]+)\\}`,
    ).exec(lock);
    requireValue(
      resolution?.[1] === sri && resolution?.[2] === path,
      `${name} frozen archive integrity mismatch`,
    );
    const members = originalMembers(join(repoRoot, path));
    if (installed) {
      const installedRoot = await realpath(join(owner, "node_modules", name));
      requireValue(
        !relative(repoRoot, installedRoot).startsWith(".."),
        "installed package outside checkout",
      );
      await assertInstalledOriginals(
        installedRoot,
        members,
        `${name} ALL installed original members differ`,
        {
          ...installerOptions,
          sdk: key === "sdk",
          protocol: key === "protocol",
          originalSdkMembers: originals.sdk,
          originalSdkRoot:
            key === "protocol"
              ? await realpath(join(app, "node_modules/@mdbase-dev/sdk"))
              : undefined,
        },
      );
    }
    archives[key] = { path, bytes: bytes.length, sha256, sri, members: members.length };
    originals[key] = members;
  }
  // Unchanged legacy alias is NOT staging-authenticated SDK trust. It can still
  // execute in root tests/dead-legacy imports, so bind its original frozen bytes
  // and ALL installed members independently, without repinning/relabeling it.
  const legacyName = "@mdbase-dev/sdk-legacy-729b5391";
  const legacyPath = "vendor/mdbase-dev-sdk-0.0.0-729b5391.tgz";
  const legacyPin = `file:../../${legacyPath}`;
  const legacyBytes = await regular(repoRoot, legacyPath);
  const legacySri =
    "sha512-2KKV/f44MbSePCpR6ACXxiiKNbw3c2Cj91cdXyItBeQcBGpz+DNviUl+6zw34ztzwyb7k7d6UpcaDgr5VfwFLw==";
  requireValue(
    pkg.dependencies?.[legacyName] === legacyPin &&
      legacyBytes.length === 747127 &&
      hash(legacyBytes) === "fad2206e0a744ac5e801917831ee580ccbd2cf09df8bd4b3bd58bc76632bbeca" &&
      `sha512-${hash(legacyBytes, "sha512")}` === legacySri,
    "unchanged legacy alias original",
  );
  const legacyImporter = lock.split("\n  apps/reader:\n")[1]?.split(/\n {2}[^ ]/)[0];
  requireValue(
    legacyImporter?.includes(
      `'${legacyName}':\n        specifier: ${legacyPin}\n        version: '@mdbase-dev/sdk@file:${legacyPath}'`,
    ) &&
      lock.includes(
        `'@mdbase-dev/sdk@file:${legacyPath}':\n    resolution: {integrity: ${legacySri}, tarball: file:${legacyPath}}`,
      ),
    "legacy alias frozen SRI/pin",
  );
  const legacyMembers = originalMembers(join(repoRoot, legacyPath));
  if (installed) {
    const legacyRoot = await realpath(join(app, "node_modules", legacyName));
    requireValue(
      !relative(repoRoot, legacyRoot).startsWith(".."),
      "legacy installed outside checkout",
    );
    equal(
      await installedMembers(legacyRoot),
      legacyMembers,
      "legacy alias ALL installed original members differ",
    );
  }
  const legacyArchive = {
    path: legacyPath,
    bytes: legacyBytes.length,
    sha256: hash(legacyBytes),
    sri: legacySri,
    members: legacyMembers.length,
  };
  // Bind EVERY monorepo SDK/UI consumer to the same originals (including UI peers).
  for (const [key, consumers] of Object.entries({
    sdk: ["packages/connect", "apps/reader"],
    ui: ["apps/reader", "apps/extension", "packages/ui", "packages/markdown-editor"],
  })) {
    const name = packages[key];
    for (const consumer of consumers) {
      const owner = join(repoRoot, consumer),
        pin = (await json(join(owner, "package.json"))).dependencies?.[name];
      requireValue(
        pin?.startsWith("file:") &&
          relative(repoRoot, resolve(owner, pin.slice(5))) === archives[key].path,
        `${consumer} inconsistent ${key} original`,
      );
      const importer = lock.split(`\n  ${consumer}:\n`)[1]?.split(/\n {2}[^ ]/)[0];
      requireValue(
        importer?.includes(`'${name}':\n        specifier: ${pin}\n`),
        `${consumer} frozen ${key} pin`,
      );
      if (key === "ui")
        requireValue(
          importer.includes(`(@mdbase-dev/sdk@file:${archives.sdk.path})`),
          `${consumer} UI SDK peer mismatch`,
        );
      if (installed) {
        const installedRoot = await realpath(join(owner, "node_modules", name));
        requireValue(
          !relative(repoRoot, installedRoot).startsWith(".."),
          "installed package outside checkout",
        );
        await assertInstalledOriginals(
          installedRoot,
          originals[key],
          `${consumer} ALL installed ${key} members differ`,
          { ...installerOptions, sdk: key === "sdk" },
        );
        if (key === "ui") {
          const peerRoot = await realpath(join(installedRoot, "..", "sdk"));
          requireValue(
            !relative(repoRoot, peerRoot).startsWith(".."),
            "UI installed SDK peer outside checkout",
          );
          await assertInstalledOriginals(
            peerRoot,
            originals.sdk,
            `${consumer} UI peer ALL installed SDK members differ`,
            { ...installerOptions, sdk: true },
          );
        }
      }
    }
  }
  // This is a delivery location, not a new approval descriptor/schema.
  const packet = `packages/connect/vendor/native-release/${target === "staging" ? "staging-eaa4e697" : target}`;
  const packetFile = (path) => regular(repoRoot, `${packet}/${path}`);
  const factsBytes = await packetFile("artifact/artifact-facts.public.json");
  // Approved public facts digests from the authenticated owner handoffs,
  // not candidate-computed authority.
  const factsSha256 =
    target === "staging"
      ? "d54aef71521ab3561bd9a81cd1303410a3fde29f8fbd35a1e0041e58d0569de3"
      : "51bdf004a7f5a72a358b4534660b11f23196cb23a8d583138b75bbc284719617";
  requireValue(hash(factsBytes) === factsSha256, "approved target facts missing/mismatched");
  const facts = JSON.parse(factsBytes); // independent facts pin BEFORE parsing
  const sdk = archives.sdk,
    sdkPath = join(repoRoot, sdk.path),
    members = originals.sdk;
  equal(
    JSON.parse(await packetFile("artifact/members.json")).sort((a, b) =>
      a.path < b.path ? -1 : 1,
    ),
    members,
    "producer complete SDK inventory mismatch",
  );
  requireValue(
    facts.archive === sdk.path.split("/").at(-1) &&
      facts.bytes === sdk.bytes &&
      facts.sha256 === sdk.sha256 &&
      facts.sri === sdk.sri &&
      facts.members === sdk.members &&
      /^[a-f0-9]{40}$/.test(facts.source) &&
      /^[a-f0-9]{40}$/.test(facts.sourceTree),
    "canonical artifact facts mismatch",
  );
  const provenanceBytes = await packetFile("artifact/provenance.json");
  requireValue(
    provenanceBytes.equals(memberBytes(sdkPath, members, "dist/native/provenance.json")),
    "provenance not byte-identical to original",
  );
  const provenance = JSON.parse(provenanceBytes);
  equal(
    [facts.trust, facts.handoff, facts.verifier],
    [provenance.trust, provenance.handoff, provenance.verifier],
    "approved facts/provenance identity",
  );
  requireValue(
    provenance.schema === "mdbn-sdk/application-assets/1" &&
      provenance.environment === target &&
      provenance.trust?.environment === target,
    "provenance target mismatch",
  );
  const contextBytes = await packetFile(`verified-${target}/next-trust/${target}-context.json`),
    context = JSON.parse(contextBytes);
  const asset = await packetFile(`verified-${target}/next-trust/${target}.json`);
  const receiptBytes = await packetFile("sdk-build-receipt.json"),
    receipt = JSON.parse(receiptBytes);
  const cp =
    target === "staging" ? "https://connect-staging.mdbase.dev" : "https://connect.mdbase.dev";
  const t = provenance.trust,
    c = context.context,
    h = provenance.handoff,
    v = provenance.verifier;
  requireValue(
    context.schema_version === 1 && context.kind === "mdbase-next-build-trust-context",
    "canonical context schema",
  );
  requireValue(
    c.environment === target &&
      c.control_plane_origin === cp &&
      c.source?.repository === "mdbase-dev/mdbase-connect" &&
      /^[a-f0-9]{40}$/.test(c.source.commit) &&
      typeof c.source.version === "string" &&
      c.source.version.length > 0,
    "target CP/source context mismatch",
  );
  const log = new URL(c.log_origin);
  requireValue(
    log.protocol === "https:" &&
      log.origin === c.log_origin &&
      c.log_origin ===
        (target === "staging" ? "https://log-staging.mdbase.dev" : "https://log.mdbase.dev") &&
      !log.username &&
      !log.password,
    "exact authenticated log origin",
  );
  equal(
    [hash(asset), t.sha256, c.sha256],
    Array(3).fill(hashes.NATIVE_TRUST_ASSET_SHA256),
    "RAW signed asset hash differs (not module/context/receipt hash)",
  );
  equal(
    [t.cpOrigin, t.logOrigin, t.sourceCommit, t.sourceVersion],
    [cp, c.log_origin, c.source.commit, c.source.version],
    "trust context bindings",
  );
  requireValue(
    h.contextSha256 === hash(contextBytes) &&
      h.receiptSha256 === hash(receiptBytes) &&
      h.asset_length === asset.length &&
      h.asset_path === `next-trust/${target}.json`,
    "handoff original byte binding",
  );
  for (const [key, value] of Object.entries(context.provenance))
    equal(h[key], value, `context provenance ${key}`);
  const proofs = {};
  for (const filename of [
    "release-trust-bundle.json",
    "release-trust-bundle.sigstore.json",
    "image-release-bundle.json",
    "image-release-bundle.sigstore.json",
  ]) {
    proofs[filename] = await packetFile(`verified-${target}/${filename}`);
    equal(hash(proofs[filename]), h.proof_sha256?.[filename], `original proof ${filename}`);
  }
  const inventory = JSON.parse(proofs["release-trust-bundle.json"]),
    image = JSON.parse(proofs["image-release-bundle.json"]);
  const a = inventory.trustAssets?.[0],
    b = inventory.imageBundle;
  const sourceMatches = (value) =>
    value?.repository === c.source.repository &&
    value?.commit === c.source.commit &&
    value?.version === c.source.version;
  requireValue(
    inventory.schemaVersion === 1 &&
      inventory.kind === "mdbase-release-trust-bundle" &&
      sourceMatches(inventory) &&
      sourceMatches(image) &&
      inventory.trustAssets?.length === 1,
    "canonical authenticated release inventory identity",
  );
  requireValue(
    a.path === h.asset_path &&
      a.length === asset.length &&
      a.sha256 === hashes.NATIVE_TRUST_ASSET_SHA256 &&
      a.environment === target &&
      a.controlPlaneOrigin === cp &&
      a.logOrigin === c.log_origin &&
      sourceMatches(a.source),
    "release inventory RAW signed trust asset binding",
  );
  requireValue(
    b?.path === "image-release-bundle.json" &&
      b.length === proofs[b.path].length &&
      b.sha256 === h.proof_sha256[b.path] &&
      b.publicationRunId === h.image_publication.run_id &&
      b.publicationRunAttempt === h.image_publication.run_attempt,
    "image inventory binding",
  );
  equal(
    [
      image.publication?.runId,
      image.publication?.runAttempt,
      inventory.publication?.runId,
      inventory.publication?.runAttempt,
      inventory.publication?.publisherCommit,
      inventory.qualification?.runId,
      inventory.qualification?.runAttempt,
    ],
    [
      h.image_publication.run_id,
      h.image_publication.run_attempt,
      h.trust_publication.run_id,
      h.trust_publication.run_attempt,
      h.trust_publication.publisher_commit,
      h.publisher_qualification.run_id,
      h.publisher_qualification.run_attempt,
    ],
    "original publication/qualification bindings",
  );
  for (const key of ["image_publication", "trust_publication", "publisher_qualification"])
    requireValue(
      Number.isSafeInteger(h[key]?.run_id) &&
        h[key].run_id > 0 &&
        Number.isSafeInteger(h[key]?.run_attempt) &&
        h[key].run_attempt > 0,
      `canonical ${key} identity`,
    );
  requireValue(
    /^[a-f0-9]{40}$/.test(h.trust_publication.publisher_commit),
    "publisher commit identity",
  );
  requireValue(
    receipt.schema === "mdbn-sdk/application-build/1" &&
      receipt.contextSha256 === hash(contextBytes) &&
      receipt.verifierSha256 === v.sha256 &&
      receipt.verifierSourceCommit === v.source &&
      v.clockOverride === false &&
      /^[a-f0-9]{40}$/.test(v.source) &&
      /^[a-f0-9]{64}$/.test(v.sha256),
    "frozen receipt/verifier binding",
  );
  const module = memberBytes(sdkPath, members, "dist/application/packaged-trust.js");
  const literal = /const metadata = (\{[^\n]+\});/.exec(module.toString());
  requireValue(literal, "unknown canonical packaged trust literal");
  equal(hash(module), facts.packagedTrustModuleSha256, "original trust MODULE (not raw ASSET)");
  const release = JSON.parse(literal[1]);
  equal(
    [
      release.schema,
      release.environment,
      release.cpOrigin,
      release.logOrigin,
      release.assetSha256,
      release.source,
    ],
    ["mdbn-app-trust/release/1", target, cp, c.log_origin, hash(asset), c.source],
    "compiled appReleaseTrust asset/context binding",
  );
  const nativeAssets = {};
  for (const [name, pin] of [
    ["runtime.wasm", provenance.runtime],
    ["sqlite3.wasm", provenance.sqlite],
    ["sqlite3.js", provenance.sqlite.initializer],
  ]) {
    const bytes = memberBytes(sdkPath, members, `dist/native/${name}`);
    requireValue(
      pin.sha256 === hash(bytes) && pin.bytes === bytes.length,
      `${name} provenance mismatch`,
    );
    nativeAssets[name] = { sha256: hash(bytes), bytes: bytes.length };
  }
  requireValue(
    provenance.runtime.source?.repository === "mdbase-dev/mdbase-next" &&
      facts.nativeSource === provenance.runtime.source.commit &&
      facts.nativeSha256 === provenance.runtime.sha256 &&
      facts.nativeBytes === provenance.runtime.bytes &&
      provenance.runtime.bytes <= provenance.runtime.maxBytes &&
      provenance.sqlite.bytes <= provenance.sqlite.maxBytes,
    "native source/budget facts",
  );
  const dep = facts.dependencies?.find((d) => d.name === packages.protocol);
  const protocol = archives.protocol;
  requireValue(
    dep &&
      dep.file === `vendor/${protocol.path.split("/").at(-1)}` &&
      dep.bytes === protocol.bytes &&
      dep.sha256 === protocol.sha256 &&
      dep.sri === protocol.sri,
    "bundled protocol original custody",
  );
  // Canonical facts.file is SDK-relative original vendor custody, NOT an app path
  // or invented basename alias. Bind that unchanged original tgz as well as every
  // installed/bundled protocol member below.
  const vendorProtocol = memberBytes(sdkPath, members, dep.file);
  requireValue(
    vendorProtocol.length === protocol.bytes &&
      hash(vendorProtocol) === protocol.sha256 &&
      `sha512-${hash(vendorProtocol, "sha512")}` === protocol.sri,
    "SDK vendor protocol original archive differs",
  );
  const bundled = members
    .filter((m) => m.path.startsWith("node_modules/@mdbase-dev/connect-protocol/"))
    .map((m) => ({
      ...m,
      path: m.path.slice("node_modules/@mdbase-dev/connect-protocol/".length),
    }));
  equal(bundled, originals.protocol, "SDK bundled protocol differs from pinned original");
  // Inspect original adapter/runtime as DATA. Reader uses offlineShellPlugin()
  // defaults, so there is embedded JSON in mdbase-shell-sw.js, not a sidecar.
  const offlineRuntime = memberBytes(sdkPath, members, "dist/offline-shell-worker.js");
  const generatedRuntime = Buffer.from(
    offlineRuntime.toString().replace(/\n\/\/# sourceMappingURL=.*$/m, ""),
  );
  const registration = Buffer.from(
    'if ("serviceWorker" in navigator) navigator.serviceWorker.register("/mdbase-shell-sw.js", {scope:"/",type:"module"}).catch(() => console.warn("Offline app support could not start."));\n',
  );
  const offlineShell = {
    runtime: { bytes: generatedRuntime.length, sha256: hash(generatedRuntime) },
    registration: { bytes: registration.length, sha256: hash(registration) },
    runtimeOriginalSha256: hash(offlineRuntime),
    adapterSha256: hash(memberBytes(sdkPath, members, "dist/offline-shell-build.js")),
  };
  return {
    environment: target,
    legacyArchive,
    offlineShell,
    installerPolicy: {
      manager: "pnpm@10.7.0",
      file: pnpmYamlShim,
      template:
        "pnpm-generated wrapper bytes are not SDK authority; all original YAML files still required",
      originalYamlMembers: members.filter((m) => m.path.startsWith("node_modules/yaml/")).length,
    },
    release,
    nativeAssets,
    archives,
    lockSha256: hash(lockBytes),
    protectedHashes: hashes,
    packet: {
      path: packet,
      factsSha256: hash(factsBytes),
      contextSha256: hash(contextBytes),
      receiptSha256: hash(receiptBytes),
      provenanceSha256: hash(provenanceBytes),
    },
    trustModuleSha256: hash(module),
    appOrigin:
      target === "staging"
        ? "https://staging.mdbase-reader.pages.dev"
        : "https://reader.mdbase.dev",
    connectOrigin: cp,
    editorOrigin:
      target === "staging" ? "https://editor-staging.mdbase.dev" : "https://editor.mdbase.dev",
  };
}
