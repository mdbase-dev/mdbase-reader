import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  writeFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { it } from "node:test";
import {
  exactUiVersion,
  loadOriginals,
  productionPin,
  protectedHashes,
  installedMembers,
  offlineShellRegistration,
} from "./originals.mjs";
const root = new URL("../../", import.meta.url).pathname;
const publication = JSON.parse(
  await readFile(join(root, "config/sdk-publication.json"), "utf8"),
).sdkPublication;
const hashes = (target) => ({ READER_TRUST_ASSET_SHA256: publication.environments[target].sha256 });
// Data-only stage double, never a publishable original. App CD downloads staging
// from the current producer; the committed local/extension staging alias may lag.
async function stagingFixture(t, pin) {
  const scratch = await mkdtemp(join(tmpdir(), "reader-staging-original-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const trust = publication.environments.staging;
  const facts = (bytes) => ({
    bytes: Buffer.byteLength(bytes),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  const runtime = "test runtime",
    sqlite = "test sqlite",
    initializer = "test sqlite initializer";
  const assetPins = {
    runtime: facts(runtime),
    sqlite: { ...facts(sqlite), initializer: facts(initializer) },
  };
  const release = {
    environment: "staging",
    cpOrigin: trust.cpOrigin,
    logOrigin: trust.logOrigin,
    assetSha256: trust.sha256,
    source: {
      repository: "mdbase-dev/mdbase-connect",
      commit: trust.sourceCommit,
      version: trust.sourceVersion,
    },
  };
  return async ({ version = pin.version, commit = pin.sourceCommit } = {}) => {
    const members = {
      "package.json": JSON.stringify({ name: trust.package, version }),
      "dist/native/provenance.json": JSON.stringify({
        schema: "mdbase-sdk/npm-publication/1",
        environment: "staging",
        commit,
        trust,
        runtime: assetPins.runtime,
      }),
      "dist/application/packaged-trust.js": `const metadata = ${JSON.stringify(release)};\n`,
      "dist/application/asset-pins.json": JSON.stringify(assetPins),
      "dist/native/runtime.wasm": runtime,
      "dist/native/sqlite3.wasm": sqlite,
      "dist/native/sqlite3.js": initializer,
      "dist/offline-shell-worker.js": "// test offline shell\n",
    };
    for (const [name, bytes] of Object.entries(members)) {
      const path = join(scratch, "package", name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    }
    return execFileSync("tar", [
      "-czf",
      "-",
      "-C",
      scratch,
      ...Object.keys(members).map((name) => "package/" + name),
    ]);
  };
}
it("authenticates the production original, frozen peers and every installed SDK/UI member", async () => {
  const intake = await loadOriginals({
    target: "production",
    repoRoot: root,
    hashes: hashes("production"),
    installed: true,
  });
  const { pin } = await productionPin(root);
  assert.equal(intake.authentication.source, pin.sourceCommit);
  assert.equal(intake.authentication.kind, "npm-provenance");
  assert.equal(intake.release.assetSha256, hashes("production").READER_TRUST_ASSET_SHA256);
  assert.throws(() => protectedHashes({}));
  await assert.rejects(
    loadOriginals({
      target: "production",
      repoRoot: root,
      hashes: { READER_TRUST_ASSET_SHA256: "0".repeat(64) },
    }),
    /protected trust hash/,
  );
});
it("binds staging to the current production producer independently of the committed staging alias", async (t) => {
  const { pin } = await productionPin(root),
    archive = await stagingFixture(t, pin),
    bytes = await archive();
  const staged = (bytes) => ({
    bytes,
    path: `https://github.com/mdbase-dev/mdbase-connect/releases/download/sdk-v${pin.version}/sdk-staging.tgz`,
    authentication: { kind: "test-double", source: pin.sourceCommit },
  });
  const options = {
    target: "staging",
    repoRoot: root,
    hashes: hashes("staging"),
    installed: false,
    authenticate: async (p) => {
      assert.equal(p.sourceCommit, pin.sourceCommit);
      return { kind: "test-double", source: p.sourceCommit };
    },
    stage: async (p) => {
      assert.equal(p.sourceCommit, pin.sourceCommit);
      assert.equal(p.version, pin.version);
      return staged(bytes);
    },
  };
  const intake = await loadOriginals(options);
  assert.equal(intake.environment, "staging");
  assert.equal(intake.authentication.source, pin.sourceCommit);
  assert.equal(intake.archives.sdk.sha256, createHash("sha256").update(bytes).digest("hex"));
  await assert.rejects(
    loadOriginals({
      ...options,
      stage: async () => ({ bytes, authentication: { source: "0".repeat(40) } }),
    }),
    /staging producer mismatch/,
  );
  // A matching authentication receipt cannot excuse wrong archive contents.
  for (const patch of [{ version: "0.0.0-test" }, { commit: "0".repeat(40) }]) {
    const wrong = await archive(patch);
    await assert.rejects(loadOriginals({ ...options, stage: async () => staged(wrong) }), {
      code: "ERR_ASSERTION",
      actual: Object.values(patch)[0],
    });
  }
});
it("installed inventory counts missing, changed and extra bytes and rejects symlinks", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "reader-installed-"));
  try {
    await writeFile(join(scratch, "original"), "one");
    const before = await installedMembers(scratch);
    await writeFile(join(scratch, "original"), "two");
    assert.notDeepEqual(await installedMembers(scratch), before);
    await writeFile(join(scratch, "extra"), "extra");
    assert.equal((await installedMembers(scratch)).length, 2);
    await rm(join(scratch, "original"));
    assert.notDeepEqual(await installedMembers(scratch), before);
    await mkdir(join(scratch, "node_modules"));
    await writeFile(join(scratch, "node_modules/installer"), "not original");
    assert.equal((await installedMembers(scratch, new Set(["node_modules"]))).length, 1);
    await symlink("extra", join(scratch, "link"));
    await assert.rejects(installedMembers(scratch), /symlink/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
for (const version of ["0.1.0-beta.212", "0.1.0", "0.2.3"])
  it(`selects the production SDK pin for exact npm version ${version}`, async (t) => {
    const fixture = await realpath(await mkdtemp(join(tmpdir(), "reader-sdk-pin-")));
    t.after(() => rm(fixture, { recursive: true, force: true }));
    const vendor = "packages/connect/vendor";
    const current = await productionPin(root);
    await mkdir(join(fixture, "apps/reader"), { recursive: true });
    await mkdir(join(fixture, vendor), { recursive: true });
    await writeFile(
      join(fixture, "apps/reader/package.json"),
      JSON.stringify({ dependencies: { "@mdbase-dev/sdk": version } }),
    );
    await copyFile(
      join(root, vendor, current.pin.artifact),
      join(fixture, vendor, current.pin.artifact),
    );
    const pin = {
      ...current.pin,
      version,
      publication: { ...current.pin.publication, ref: "refs/tags/v" + version },
    };
    const slug = version.replace(/^0\.1\.0-beta\./, "beta");
    await writeFile(join(fixture, vendor, `sdk-production-${slug}.json`), JSON.stringify(pin));
    assert.equal((await productionPin(fixture)).pin.version, version);
    for (const refused of ["^" + version, "latest", "0.0.9", "0.1.0-rc.1"]) {
      await writeFile(
        join(fixture, "apps/reader/package.json"),
        JSON.stringify({ dependencies: { "@mdbase-dev/sdk": refused } }),
      );
      await assert.rejects(productionPin(fixture), /exact npm SDK required/);
    }
  });
it("accepts beta and plain exact UI pins only", () => {
  for (const version of ["0.1.0-beta.176", "0.1.0", "0.2.1"]) assert.match(version, exactUiVersion);
  for (const version of ["^0.1.0", "latest", "0.1", "0.1.0 "])
    assert.doesNotMatch(version, exactUiVersion);
});
it("derives the exact offline-shell registration bytes from either known SDK generator and refuses anything else", () => {
  const legacy =
    'const base = "/";\n        await writeFile(join(directory, registrationFile), `if ("serviceWorker" in navigator) navigator.serviceWorker.register(${JSON.stringify(base + workerFile)}, {scope:${JSON.stringify(base)},type:"module"}).catch(() => console.warn("Offline app support could not start."));\\n`);\n';
  assert.equal(
    offlineShellRegistration(Buffer.from(legacy)),
    'if ("serviceWorker" in navigator) navigator.serviceWorker.register("/mdbase-shell-sw.js", {scope:"/",type:"module"}).catch(() => console.warn("Offline app support could not start."));\n',
  );
  const activating =
    '/** doc */\nfunction offlineShellRegistration(worker, scope) {\n    return `if ("serviceWorker" in navigator) {\n  navigator.serviceWorker.register(${JSON.stringify(worker)}, {scope:${JSON.stringify(scope)},type:"module"}).then(r => r.waiting?.postMessage({type:"mdbase-shell:activate"}));\n}\n`;\n}\n';
  assert.equal(
    offlineShellRegistration(Buffer.from(activating)),
    'if ("serviceWorker" in navigator) {\n  navigator.serviceWorker.register("/mdbase-shell-sw.js", {scope:"/",type:"module"}).then(r => r.waiting?.postMessage({type:"mdbase-shell:activate"}));\n}\n',
  );
  for (const refused of [
    "",
    legacy + activating,
    activating.replace("${JSON.stringify(scope)}", "${scope}"),
    activating.replace("${JSON.stringify(worker)}", '"/sw.js"'),
  ])
    assert.throws(() => offlineShellRegistration(Buffer.from(refused)), /registration/);
});
