import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readerDeployments } from "./deployment-environment.mjs";
import { readerSdkTarget, verifiedReaderSdk } from "./reader-sdk.mjs";

const repo = new URL("../../../", import.meta.url).pathname;
const vendor = "packages/connect/vendor";

test("SDK selectors refuse unknown/conflicting environments and origins", () => {
  assert.equal(readerSdkTarget({}), "production");
  for (const target of Object.keys(readerDeployments)) {
    assert.equal(readerSdkTarget({ VITE_MDBASE_ENV: target }), target);
    assert.equal(readerSdkTarget({ MDBASE_ENV: target }), target);
  }
  for (const environment of [
    { MDBASE_ENV: "qa" },
    { MDBASE_ENV: "toString" },
    { MDBASE_ENV: "lab", VITE_MDBASE_ENV: "production" },
    { MDBASE_ENV: "lab", MDBASE_READER_DEPLOY_TARGET: "staging" },
    { MDBASE_ENV: "lab", VITE_MDBASE_CONNECT_URL: "https://connect.mdbase.dev" },
  ]) {
    assert.throws(() => readerSdkTarget(environment));
  }
});

test("all three original archives match installed bytes and packaged target trust", async () => {
  for (const target of Object.keys(readerDeployments)) {
    const sdk = await verifiedReaderSdk(target);
    assert.equal(sdk.receipt.environment, target);
    assert.equal(sdk.receipt.cpOrigin, readerDeployments[target].connectUrl);
    const pkg = JSON.parse(await readFile(join(repo, "apps/reader/package.json"), "utf8"));
    const name = target === "production" ? "@mdbase-dev/sdk" : "@mdbase-dev/sdk-" + target;
    assert.ok(pkg.dependencies[name].endsWith(sdk.receipt.artifact));
    assert.ok(sdk.offlineShellUrl.endsWith("/dist/offline-shell-build.js"));
    for (const id of ["@mdbase-dev/sdk", "@mdbase-dev/sdk/browser", "@mdbase-dev/sdk/testing"]) {
      assert.equal(sdk.aliases.filter((alias) => alias.find.test(id)).length, 1);
    }
    assert.equal(
      sdk.aliases.some((alias) => alias.find.test("@mdbase-dev/sdk-legacy-729b5391")),
      false,
    );
  }
});

async function fixture(t, name = "@mdbase-dev/sdk-lab") {
  const root = await mkdtemp(join(tmpdir(), "reader-sdk-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, vendor), { recursive: true });
  await mkdir(join(root, "apps/reader/node_modules/@mdbase-dev"), { recursive: true });
  await symlink(
    join(repo, "apps/reader/node_modules", name),
    join(root, "apps/reader/node_modules/@mdbase-dev/sdk-lab"),
  );
  const path = join(root, vendor, "sdk-lab-eaa4e697.json");
  await cp(join(repo, vendor, "sdk-lab-eaa4e697.json"), path);
  const pin = JSON.parse(await readFile(path, "utf8"));
  await cp(join(repo, vendor, pin.artifact), join(root, vendor, pin.artifact));
  return { root, path, pin };
}

test("archive tampering refuses before any SDK import", async (t) => {
  const { root, pin } = await fixture(t);
  await rm(join(root, vendor, pin.artifact));
  await writeFile(join(root, vendor, pin.artifact), "tampered");
  await assert.rejects(verifiedReaderSdk("lab", root), /archive length mismatch/);
});

test("a rehashed production archive cannot masquerade as LAB", async (t) => {
  const { root, path, pin } = await fixture(t, "@mdbase-dev/sdk");
  const production = "sdk-e55d99c0-production-beta141.tgz";
  const bytes = await readFile(join(repo, vendor, production));
  await cp(join(repo, vendor, production), join(root, vendor, production));
  await writeFile(
    path,
    JSON.stringify({
      ...pin,
      artifact: production,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }),
  );
  await assert.rejects(verifiedReaderSdk("lab", root), /provenance environment mismatch/);
});

for (const [oldValue, newValue, refusal] of [
  [
    '"cpOrigin":"https://connect-lab.mdbase.dev"',
    '"cpOrigin":"https://evil.example"',
    /packaged origin mismatch/,
  ],
  ['"environment":"lab"', '"environment":"production"', /packaged environment mismatch/],
]) {
  test("rehashed trust with " + newValue + " still refuses", async (t) => {
    const { root, path, pin } = await fixture(t);
    const unpacked = join(root, "unpacked");
    await mkdir(unpacked);
    const archive = join(root, vendor, pin.artifact);
    execFileSync("tar", ["-xzf", archive, "-C", unpacked]);
    const trustPath = join(unpacked, "package/dist/application/packaged-trust.js");
    const text = await readFile(trustPath, "utf8");
    assert.ok(text.includes(oldValue));
    await rm(trustPath);
    await writeFile(trustPath, text.replace(oldValue, newValue));
    await rm(archive);
    execFileSync("tar", ["-czf", archive, "-C", unpacked, "package"]);
    const bytes = await readFile(archive);
    await writeFile(
      path,
      JSON.stringify({
        ...pin,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    );
    const alias = join(root, "apps/reader/node_modules/@mdbase-dev/sdk-lab");
    await rm(alias);
    await symlink(join(unpacked, "package"), alias);
    await assert.rejects(verifiedReaderSdk("lab", root), refusal);
  });
}

test("wrong installed alias refuses even when the archive pin is correct", async (t) => {
  const { root } = await fixture(t, "@mdbase-dev/sdk-staging");
  await assert.rejects(verifiedReaderSdk("lab", root), /Installed SDK (hash|length) mismatch/);
});
