import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { loadOriginals, productionPin, protectedHashes, installedMembers } from "./originals.mjs";
const root = new URL("../../", import.meta.url).pathname;
const publication = JSON.parse(
  await readFile(join(root, "config/sdk-publication.json"), "utf8"),
).sdkPublication;
const hashes = (target) => ({ READER_TRUST_ASSET_SHA256: publication.environments[target].sha256 });
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
it("binds the derived staging original to the authenticated production producer without repacking or retargeting", async () => {
  const { pin } = await productionPin(root),
    pkg = JSON.parse(await readFile(join(root, "apps/reader/package.json"), "utf8"));
  const path = join(root, "apps/reader", pkg.dependencies["@mdbase-dev/sdk-staging"].slice(5)),
    bytes = await readFile(path);
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
      return {
        bytes,
        path: `https://github.com/mdbase-dev/mdbase-connect/releases/download/sdk-v${p.version}/sdk-staging.tgz`,
        authentication: { kind: "test-double", source: p.sourceCommit },
      };
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
