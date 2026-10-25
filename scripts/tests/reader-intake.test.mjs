import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadOriginals, protectedHashes } from "../lib/native-originals.mjs";
import { approvedHashes, approvedProductionHashes } from "../lib/reader-approved-intake.mjs";
import { assertExtensionManifests } from "../lib/reader-extension.mjs";
test("Reader pins the production e55d99c0 SDK with beta141 trust", async () => {
  const vendor = "packages/connect/vendor/";
  const pin = JSON.parse(await readFile(vendor + "sdk-production-beta141.json", "utf8"));
  const archive = vendor + pin.artifact;
  const bytes = await readFile(archive);
  assert.equal(pin.sourceCommit, "e55d99c0d986e5c17e0dabea0e43305d946190e9");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "f05837e4571a7e528d289dea6a9d2ee2e5c2e3a1e4f8f70fe772a8138e32f970",
  );
  for (const [owner, path] of [
    ["apps/reader", "../../" + archive],
    ["packages/connect", "vendor/" + pin.artifact],
  ]) {
    const pkg = JSON.parse(await readFile(owner + "/package.json", "utf8"));
    assert.equal(pkg.dependencies["@mdbase-dev/sdk"], "file:" + path);
  }
  const member = (path) => execFileSync("tar", ["-xOzf", archive, "package/dist/" + path]);
  const trust = JSON.parse(
    /^const metadata = (\{.*\});$/m.exec(member("application/packaged-trust.js"))[1],
  );
  assert.equal(trust.environment, "production");
  assert.equal(trust.cpOrigin, "https://connect.mdbase.dev");
  assert.equal(trust.logOrigin, "https://log.mdbase.dev");
  assert.equal(trust.source.version, "0.1.0-beta.141");
  assert.equal(
    trust.assetSha256,
    "7912e40838213e60b65848350d319a48019021317b112e3326429b250f0133d7",
  );
  const provenance = JSON.parse(member("native/provenance.json"));
  assert.equal(provenance.environment, "production");
  assert.deepEqual(provenance.trust, pin.trust);
});
test("actual staging extension has exact log and no native loopback", async () => {
  const { extensionEnvironment } =
    await import("../../apps/extension/scripts/extension-manifest.mjs");
  const env = extensionEnvironment({
    MDBASE_ENV: "staging",
    MDBASE_EXTENSION_STAGING_ID: "palmhjikdacodimpnkapmidobfbocdgf",
  });
  assert.equal(env.logUrl, "https://log-staging.mdbase.dev");
  assert.equal(env.loopbackUrl, "");
});
test("live hashes have no repository/candidate fallback", () =>
  assert.throws(() => protectedHashes({}), /four protected/));
test("production intake binds installed originals and the beta141 packet", async () => {
  const trust = await loadOriginals({
    target: "production",
    repoRoot: process.cwd(),
    hashes: approvedProductionHashes,
    installed: true,
  });
  assert.equal(trust.environment, "production");
  assert.equal(trust.archives.sdk.members, 896);
  assert.equal(trust.nativeAssets["runtime.wasm"].bytes, 3682463);
  assert.equal(trust.release.source.version, "0.1.0-beta.141");
  assert.equal(trust.release.assetSha256, approvedProductionHashes.NATIVE_TRUST_ASSET_SHA256);
  assert.equal(trust.appOrigin, "https://reader.mdbase.dev");
  assert.equal(trust.connectOrigin, "https://connect.mdbase.dev");
  assert.equal(trust.release.logOrigin, "https://log.mdbase.dev");
  assert.equal(trust.editorOrigin, "https://editor.mdbase.dev");
  const { extensionEnvironment, extensionManifest, extensionMdbaseManifest } =
    await import("../../apps/extension/scripts/extension-manifest.mjs");
  const environment = extensionEnvironment({ MDBASE_ENV: trust.environment });
  const reader = JSON.parse(await readFile("apps/reader/src/generated/mdbase-app.json"));
  const chrome = extensionManifest(environment);
  assert.equal(chrome.key, undefined);
  assert.deepEqual(
    assertExtensionManifests(chrome, extensionMdbaseManifest(reader, environment), trust),
    {
      publicId: "kimdfjefhbfgfecconmaiaaindjccidp",
      webStorePublished: false,
      nativeAdmission: false,
    },
  );
  assert.equal(
    trust.packet.factsSha256,
    "a385fd90adce58c7d51da50f00142ec3970add6bea621af6893c9e63c0cc3fc0",
  );
});
test("production still refuses staging protected hashes", async () => {
  await assert.rejects(
    loadOriginals({ target: "production", repoRoot: process.cwd(), hashes: approvedHashes }),
  );
});
