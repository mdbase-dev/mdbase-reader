import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { intakeCopy } from "./helpers/reader-intake.mjs";
import { loadOriginals, protectedHashes } from "../lib/native-originals.mjs";
import { approvedHashes, approvedProductionHashes } from "../lib/reader-approved-intake.mjs";
import { assertExtensionManifests } from "../lib/reader-extension.mjs";
test("Reader pins the production dce61ff5 SDK with beta141 trust", async () => {
  const vendor = "packages/connect/vendor/";
  const pin = JSON.parse(await readFile(vendor + "sdk-production-beta141.json", "utf8"));
  const archive = vendor + pin.artifact;
  const bytes = await readFile(archive);
  assert.equal(pin.sourceCommit, "dce61ff53fcfaf649e9e4152239d0f3d1e0972da");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "a9e6abc0bc8062f1603aa0fb9bf239a4932bee08b8d5e63c4526412479299334",
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
test("production intake binds approved archive originals and the unchanged beta141 packet", async (t) => {
  const root = await intakeCopy("production");
  t.after(() => rm(root, { recursive: true, force: true }));
  const trust = await loadOriginals({
    target: "production",
    repoRoot: root,
    hashes: approvedProductionHashes,
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
    "8e36f94c01d6f918390e89638c6f0757a7d5b74a6aaa6cfff14545cf47b29899",
  );
});
test("native approval refuses the npm UI candidate without an approved file intake", async () => {
  // npm installation is intentionally not native-release qualification. Passing
  // member checks must never silently grant native approval.
  await assert.rejects(
    loadOriginals({
      target: "production",
      repoRoot: process.cwd(),
      hashes: approvedProductionHashes,
      installed: true,
    }),
    /@mdbase-dev\/ui must remain a file pin/,
  );
});
test("production still refuses staging protected hashes", async () => {
  await assert.rejects(
    loadOriginals({ target: "production", repoRoot: process.cwd(), hashes: approvedHashes }),
  );
});
