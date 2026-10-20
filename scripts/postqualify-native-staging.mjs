// DATA-ONLY recovery/qualification of ALREADY BUILT staging output. No app/SDK/
// worker imports/eval, build, hooks, Wrangler, network, deployment or fake Git.
import { createHash } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadOriginals } from "./lib/native-originals.mjs";
import { approvedHashes } from "./lib/reader-approved-intake.mjs";
import { assertInventory } from "./lib/native-publish-bytes.mjs";
import { assertOfflineShell } from "./lib/reader-offline-shell.mjs";
import {
  assertExtension,
  createExtensionZip,
  assertExtensionZip,
} from "./lib/reader-extension.mjs";
import { sourceHostingPolicy, coveredHostingControls } from "./lib/reader-hosting-policy.mjs";
import {
  assertBuiltTarget,
  assertInventoryCoverage,
} from "../apps/reader/scripts/native-publisher.mjs";
import {
  stagingManifestKey,
  stagingExtensionId,
} from "../apps/extension/scripts/staging-public-key.mjs";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const check = (ok, why) => {
  if (!ok) throw Error("Post-only staging refusal: " + why);
};
const repo = resolve("."),
  input = process.argv[2],
  root = resolve("artifacts/build/native-staging");
check(
  input &&
    !input.startsWith("/") &&
    !input.split(/[\\/]/).some((p) => p === "." || p === ".." || !p),
  "relative PUBLIC-only input required",
);
check(
  !process.env.CLOUDFLARE_API_TOKEN && !process.env.CLOUDFLARE_ACCOUNT_ID,
  "no Cloudflare credentials",
);
const inputBytes = await readFile(join(repo, input)),
  value = JSON.parse(inputBytes);
check(
  value.privateMaterialExported === false && value.publicId === stagingExtensionId,
  "public transport",
);
const key = stagingManifestKey(value.publicSpkiBase64),
  publicSha = hash(Buffer.from(key, "base64"));
check(value.publicSpkiSha256 === publicSha, "public transport digest");
const plan = JSON.parse(await readFile(join(root, "plan.json")));
check(
  plan.qualificationOnly === true && plan.sha === null && plan.tree === null,
  "local-only preexisting plan, no forged Git",
);
const installerEvidence = [];
const trust = await loadOriginals({
  target: "staging",
  repoRoot: repo,
  hashes: approvedHashes,
  installed: true,
  installerEvidence,
});
check(
  JSON.stringify(plan.sdkTrust) === JSON.stringify(trust),
  "preexisting build plan no longer matches exact original inputs",
);
const inventoryBytes = await readFile(join(root, "inventory.json")),
  extensionBytes = await readFile(join(root, "extension-inventory.json"));
const inventory = JSON.parse(inventoryBytes),
  extensionInventory = JSON.parse(extensionBytes);
// Reassert SAVED independent all-file inventories. Never regenerate them to
// silently bless changed/extra/hidden files in historical compiled output.
await assertInventory(join(root, "publish"), inventory);
await assertInventory(join(root, "extension"), extensionInventory);
assertBuiltTarget({
  target: "staging",
  manifest: JSON.parse(await readFile(join(root, "publish/.well-known/mdbase-app.json"))),
  routes: JSON.parse(await readFile(join(root, "publish/_routes.json"))),
});
assertInventoryCoverage(inventory, trust);
assertInventoryCoverage(extensionInventory, { ...trust, extension: true });
const offlineShell = await assertOfflineShell(join(root, "publish"), inventory, trust.offlineShell);
coveredHostingControls(await sourceHostingPolicy(repo), inventory);
const extension = await assertExtension(root, trust);
check(extension.publicSpkiSha256 === publicSha, "compiled extension uses a different public input");
for (const dir of ["publish", "extension"]) {
  execFileSync(
    "node",
    ["apps/reader/scripts/validate-manifest.mjs", join(root, dir, ".well-known/mdbase-app.json")],
    { cwd: repo, stdio: ["ignore", "pipe", "pipe"], timeout: 30000 },
  );
  const files = dir === "publish" ? inventory : extensionInventory;
  const js = await Promise.all(
    files
      .filter((f) => /\.m?js$/.test(f.path) && f.path !== "_worker.js")
      .map((f) => readFile(join(root, dir, f.path), "utf8")),
  );
  for (const literal of [
    trust.release.cpOrigin,
    trust.release.logOrigin,
    trust.release.assetSha256,
    trust.release.source.commit,
  ])
    check(
      js.some((s) => s.includes(literal)),
      dir + " compiled original trust/CP/log/source binding",
    );
}
let zipExists = true;
try {
  await access(join(root, "extension.zip"));
} catch {
  zipExists = false;
}
if (!zipExists) await createExtensionZip(root, extensionInventory); // ONLY packaging, no rebuild.
await assertExtensionZip(root, extensionInventory);
await assertInventory(join(root, "publish"), inventory);
await assertInventory(join(root, "extension"), extensionInventory);
check(
  hash(await readFile(join(root, "inventory.json"))) === hash(inventoryBytes) &&
    hash(await readFile(join(root, "extension-inventory.json"))) === hash(extensionBytes),
  "saved inventory bytes changed",
);
const facts = JSON.parse(
  await readFile(join(repo, trust.packet.path, "artifact/artifact-facts.public.json")),
);
const result = {
  qualificationOnly: true,
  mode: "post-only existing compiled output; ZERO product builds invoked",
  inputEvidence: {
    transportFileSha256: hash(inputBytes),
    publicSpkiSha256: publicSha,
    publicId: stagingExtensionId,
  },
  sdk: trust.archives.sdk.sha256,
  sdkSource: facts.source,
  sdkSourceTree: facts.sourceTree,
  publicFactsSha256: trust.packet.factsSha256,
  ui: trust.archives.ui.sha256,
  protocol: trust.archives.protocol.sha256,
  rawTrustAsset: trust.release.assetSha256,
  compiledRawTrustAssetHash: trust.release.assetSha256,
  trustModuleSha256: trust.trustModuleSha256,
  nativeAssets: trust.nativeAssets,
  extension,
  offlineShell,
  installerEvidence,
  webFiles: inventory.length,
  extensionFiles: extensionInventory.length,
  webInventorySha256: hash(inventoryBytes),
  extensionInventorySha256: hash(extensionBytes),
  extensionZipSha256: hash(await readFile(join(root, "extension.zip"))),
  publication: false,
  admission: false,
};
await writeFile(
  resolve("artifacts/build/reader-staging-post-qualification.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
