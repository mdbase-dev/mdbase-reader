import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadOriginals, protectedHashes } from "../lib/native-originals.mjs";
import { approvedHashes } from "../lib/reader-approved-intake.mjs";
test("Reader pins the original production eaa4 SDK with beta141 trust", async () => {
  const vendor = "packages/connect/vendor/";
  const pin = JSON.parse(await readFile(vendor + "sdk-production-beta141.json", "utf8"));
  const archive = vendor + pin.artifact;
  const bytes = await readFile(archive);
  assert.equal(pin.sourceCommit, "eaa4e697fc1198f32fc3714f377342a24c56d985");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "e64771a90bed2fb3837d4b65df8930fcd124d3059fcb0bcbaf9d64dbfb148205",
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
test("production refuses staging originals and missing production custody", async () => {
  await assert.rejects(
    loadOriginals({ target: "production", repoRoot: process.cwd(), hashes: approvedHashes }),
  );
});
