import assert from "node:assert/strict";
import { test } from "node:test";
import { loadOriginals, protectedHashes } from "../lib/native-originals.mjs";
import { approvedHashes } from "../lib/reader-approved-intake.mjs";
test("Reader actual authenticated canonical staging originals, never LAB retarget", async () => {
  const plan = await loadOriginals({
    target: "staging",
    repoRoot: process.cwd(),
    hashes: approvedHashes,
  });
  assert.equal(plan.archives.sdk.members, 896);
  assert.equal(plan.legacyArchive.members, 275);
  assert.equal(
    plan.legacyArchive.sha256,
    "fad2206e0a744ac5e801917831ee580ccbd2cf09df8bd4b3bd58bc76632bbeca",
  );
  assert.equal(
    plan.packet.factsSha256,
    "d54aef71521ab3561bd9a81cd1303410a3fde29f8fbd35a1e0041e58d0569de3",
  );
  assert.equal(
    plan.trustModuleSha256,
    "5443500b96150bc719afdd7e3f15b5ea1c17cdf75ac3fa9568d4111f4a776342",
  );
  assert.equal(plan.release.source.commit, "f45df4598a5bff891de68eec3431ec7744885067");
  assert.equal(plan.nativeAssets["runtime.wasm"].bytes, 3676583);
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
test("production refuses staging originals and missing production custody", async () => {
  await assert.rejects(
    loadOriginals({ target: "production", repoRoot: process.cwd(), hashes: approvedHashes }),
  );
});
