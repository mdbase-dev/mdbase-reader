// Finite SOURCE qualification/build only. Never deploy/admit/install in Chrome.
// rpnpm forwards neither .git nor env: local qualification accepts ONLY a relative
// PUBLIC input file, uses data-only original gates, and never forges dispatch/ref.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { loadOriginals, protectedHashes } from "./lib/native-originals.mjs";
import { approvedHashes } from "./lib/reader-approved-intake.mjs";
import { inventoryDirectory } from "./lib/native-publish-bytes.mjs";
import { assertOfflineShell } from "./lib/reader-offline-shell.mjs";
import { assertExtension, assertExtensionZip } from "./lib/reader-extension.mjs";
import {
  sourceHostingPolicy,
  uploadConfiguration,
  coveredHostingControls,
} from "./lib/reader-hosting-policy.mjs";
import {
  assertBuiltTarget,
  assertInventoryCoverage,
} from "../apps/reader/scripts/native-publisher.mjs";
import {
  stagingManifestKey,
  stagingExtensionId,
} from "../apps/extension/scripts/staging-public-key.mjs";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const repo = resolve("."),
  [mode, input, output] = process.argv.slice(2);
if (!["local-qualification", "ci-build"].includes(mode))
  throw Error("Explicit qualification or CI build mode required");
if (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_ACCOUNT_ID)
  throw Error("Unprivileged build must not receive Cloudflare credentials");
const installerEvidence = [];
let plan, key, inputEvidence;
if (mode === "local-qualification") {
  if (
    !input ||
    input.startsWith("/") ||
    input.split(/[\\/]/).some((s) => s === ".." || s === "." || !s)
  )
    throw Error("Relative PUBLIC-only input file required");
  const bytes = await readFile(join(repo, input)),
    value = JSON.parse(bytes);
  if (value.publicId !== stagingExtensionId || value.privateMaterialExported !== false)
    throw Error("Public-only transport identity");
  key = stagingManifestKey(value.publicSpkiBase64);
  const publicSpkiSha256 = hash(Buffer.from(key, "base64"));
  if (value.publicSpkiSha256 !== publicSpkiSha256) throw Error("Public transport digest");
  inputEvidence = {
    transportFileSha256: hash(bytes),
    publicSpkiSha256,
    publicId: stagingExtensionId,
  };
  // NOT publication authority. Source tree qualification only; no Git substitute.
  plan = {
    sha: null,
    tree: null,
    qualificationOnly: true,
    sdkTrust: await loadOriginals({
      target: "staging",
      repoRoot: repo,
      hashes: approvedHashes,
      installed: true,
      installerEvidence,
    }),
  };
} else {
  plan = JSON.parse(await readFile(input, "utf8"));
  if (
    plan.qualificationOnly ||
    !/^[a-f0-9]{40}$/.test(plan.sha) ||
    !/^[a-f0-9]{40}$/.test(plan.tree)
  )
    throw Error("CI exact-source plan required");
  const actual = await loadOriginals({
    target: "staging",
    repoRoot: repo,
    hashes: protectedHashes(),
    installed: true,
    installerEvidence,
  });
  if (JSON.stringify(actual) !== JSON.stringify(plan.sdkTrust))
    throw Error("Installed plan changed");
  key = stagingManifestKey(process.env.MDBASE_EXTENSION_STAGING_PUBLIC_KEY);
  inputEvidence = {
    publicSpkiSha256: hash(Buffer.from(key, "base64")),
    publicId: stagingExtensionId,
  };
}
const root = resolve(output ?? "artifacts/build/native-staging");
if (root === repo || relative(repo, root) === "") throw Error("Unsafe build output");
await mkdir(root, { recursive: true });
await writeFile(
  join(root, "installer-evidence.json"),
  JSON.stringify(installerEvidence, null, 2) + "\n",
);
plan.origin = plan.sdkTrust.appOrigin;
plan.connectOrigin = plan.sdkTrust.connectOrigin;
plan.pagesBranch = "staging";
await writeFile(join(root, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
const env = {
  ...process.env,
  MDBASE_ENV: "staging",
  VITE_MDBASE_ENV: "staging",
  MDBASE_READER_ORIGIN: plan.origin,
  MDBASE_READER_BUILD_ID: plan.sha ?? "source-qualification-staging",
  VITE_MDBASE_READER_BUILD_ID: plan.sha ?? "source-qualification-staging",
  VITE_MDBASE_CONNECT_URL: plan.connectOrigin,
  VITE_MDBASE_CONNECT_LOOPBACK_URL: "",
  MDBASE_EXTENSION_STAGING_ID: stagingExtensionId,
  MDBASE_EXTENSION_STAGING_PUBLIC_KEY: key,
  WRANGLER_SEND_METRICS: "false",
  NPM_CONFIG_USERCONFIG: "/dev/null",
  NPM_CONFIG_GLOBALCONFIG: "/dev/null",
};
const run = (cmd, args, cwd = repo) => execFileSync(cmd, args, { cwd, env, stdio: "inherit" });
const generated = [
  "apps/reader/public/.well-known/mdbase-app.json",
  "apps/reader/src/generated/mdbase-app.json",
  "apps/extension/src/generated/mdbase-app.json",
];
const originals = await Promise.all(generated.map((p) => readFile(join(repo, p))));
const tools = await mkdtemp(join(root, "tools-"));
try {
  // All originals and ALL installed members have passed BEFORE any SDK code.
  run("pnpm", ["--filter", "@mdbase-reader/app", "build"]);
  run("pnpm", ["--filter", "@mdbase-reader/extension", "build"]);
  await mkdir(join(repo, "apps/extension/dist/.well-known"), { recursive: true });
  await cp(
    join(repo, "apps/extension/src/generated/mdbase-app.json"),
    join(repo, "apps/extension/dist/.well-known/mdbase-app.json"),
  );
  for (const name of ["package.json", "pnpm-lock.yaml"])
    await cp(join(repo, "tools/native-publisher", name), join(tools, name));
  run(
    "pnpm",
    ["--ignore-workspace", "install", "--frozen-lockfile", "--ignore-scripts", "--ignore-pnpmfile"],
    tools,
  );
  if (
    JSON.parse(await readFile(join(tools, "node_modules/wrangler/package.json"))).version !==
    "4.114.0"
  )
    throw Error("Pinned deploy-tool version");
  const policy = await sourceHostingPolicy(repo);
  await writeFile(join(tools, "wrangler.json"), JSON.stringify(uploadConfiguration(policy)));
  run(
    join(tools, "node_modules/.bin/wrangler"),
    [
      "pages",
      "functions",
      "build",
      join(repo, "apps/reader/functions"),
      "--outfile",
      join(repo, "apps/reader/dist/_worker.js"),
    ],
    tools,
  );
  await cp(join(repo, "apps/reader/dist"), join(root, "publish"), { recursive: true });
  await cp(join(repo, "apps/extension/dist"), join(root, "extension"), { recursive: true });
  // Use the real canonical parser, only AFTER installed protocol equality gate.
  run("node", [
    "apps/reader/scripts/validate-manifest.mjs",
    join(root, "publish/.well-known/mdbase-app.json"),
  ]);
  run("node", [
    "apps/reader/scripts/validate-manifest.mjs",
    join(root, "extension/.well-known/mdbase-app.json"),
  ]);
  const inventory = await inventoryDirectory(join(root, "publish"), {
    maxFileBytes: 25 * 1024 * 1024,
  });
  assertBuiltTarget({
    target: "staging",
    manifest: JSON.parse(await readFile(join(root, "publish/.well-known/mdbase-app.json"))),
    routes: JSON.parse(await readFile(join(root, "publish/_routes.json"))),
  });
  assertInventoryCoverage(inventory, plan.sdkTrust);
  const offlineShell = await assertOfflineShell(
    join(root, "publish"),
    inventory,
    plan.sdkTrust.offlineShell,
  );
  coveredHostingControls(policy, inventory);
  const extensionInventory = await inventoryDirectory(join(root, "extension"));
  assertInventoryCoverage(extensionInventory, { ...plan.sdkTrust, extension: true });
  const extension = await assertExtension(root, plan.sdkTrust);
  for (const dir of ["publish", "extension"]) {
    const files = dir === "publish" ? inventory : extensionInventory;
    const js = await Promise.all(
      files
        .filter((a) => /\.m?js$/.test(a.path) && a.path !== "_worker.js")
        .map((a) => readFile(join(root, dir, a.path), "utf8")),
    );
    // Exact original native/SQLite members plus compiled authenticated trust
    // literals/CP/log/source establish target packaging, NOT fresh SDK auth.
    for (const literal of [
      plan.sdkTrust.release.cpOrigin,
      plan.sdkTrust.release.logOrigin,
      plan.sdkTrust.release.assetSha256,
      plan.sdkTrust.release.source.commit,
    ])
      if (!js.some((s) => s.includes(literal)))
        throw Error(dir + " missing compiled authenticated trust binding");
  }
  await writeFile(join(root, "inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
  await writeFile(
    join(root, "extension-inventory.json"),
    JSON.stringify(extensionInventory, null, 2) + "\n",
  );
  run("zip", ["-qr", join(root, "extension.zip"), "."], join(root, "extension"));
  await assertExtensionZip(root, extensionInventory);
  console.log(
    JSON.stringify(
      {
        qualificationOnly: mode === "local-qualification",
        inputEvidence,
        extension,
        offlineShell,
        installerEvidence,
        webFiles: inventory.length,
        extensionFiles: extensionInventory.length,
        webInventorySha256: hash(await readFile(join(root, "inventory.json"))),
        extensionInventorySha256: hash(await readFile(join(root, "extension-inventory.json"))),
        extensionZipSha256: hash(await readFile(join(root, "extension.zip"))),
        sdk: plan.sdkTrust.archives.sdk.sha256,
        ui: plan.sdkTrust.archives.ui.sha256,
        protocol: plan.sdkTrust.archives.protocol.sha256,
        rawTrustAsset: plan.sdkTrust.release.assetSha256,
        publication: false,
        admission: false,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(generated.map((p, i) => writeFile(join(repo, p), originals[i])));
  await rm(tools, { recursive: true, force: true });
}
