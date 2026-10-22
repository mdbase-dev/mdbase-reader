import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventoryDirectory } from "../lib/native-publish-bytes.mjs";
import { parseEmbeddedOfflineManifest, assertOfflineShell } from "../lib/reader-offline-shell.mjs";
import { offlineFixture, digest } from "./reader-offline-fixture.mjs";
async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "reader-offline-data-"));
  await mkdir(join(root, ".well-known"));
  for (const [path, bytes] of Object.entries({
    "index.html": "<head></head>",
    ".nojekyll": "",
    ".well-known/mdbase-app.json": "{}",
    "_worker.js": "capture source",
    "app.js.map": "map",
  }))
    await writeFile(join(root, path), bytes);
  return { root, ...(await offlineFixture(root, options)) };
}
test("actual canonical embedded JSON, including 58-cache-asset fixture, is not the FULL file inventory", async () => {
  const f = await fixture({ extraCached: 55 });
  try {
    const inventory = await inventoryDirectory(f.root),
      proof = await assertOfflineShell(f.root, inventory, f.original);
    assert.equal(proof.cachedAssets, 58);
    assert.equal(proof.fullInventoryFiles, 63);
    assert.ok(inventory.some((a) => a.path === ".nojekyll"));
    assert.ok(inventory.some((a) => a.path === "_worker.js"));
    assert.ok(inventory.some((a) => a.path === "app.js.map"));
    assert.equal(
      f.manifest.assets.some((a) => a.path.startsWith(".")),
      false,
    );
    assert.equal(
      parseEmbeddedOfflineManifest(await readFile(join(f.root, "mdbase-shell-sw.js"))).assets
        .length,
      58,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
for (const mutation of [
  "bad-hash",
  "omitted-cached-asset",
  "extra-cached-path",
  "duplicate",
  "traversal",
  "wrong-version",
  "code-not-JSON",
  "unexpected-prefix",
  "unexpected-suffix",
  "duplicate-JSON-key",
])
  test("embedded " + mutation + " refuses even with freshly matching FULL inventory", async () => {
    const f = await fixture();
    try {
      let m = structuredClone(f.manifest),
        text;
      if (mutation === "bad-hash") m.assets[0].sha256 = "a".repeat(64);
      if (mutation === "omitted-cached-asset") m.assets = m.assets.slice(1);
      if (mutation === "extra-cached-path")
        m.assets.push({ path: "not-shipped.js", sha256: "b".repeat(64) });
      if (mutation === "duplicate") m.assets.push(m.assets[0]);
      if (mutation === "traversal") m.assets[0].path = "../escape.js";
      m.version = digest(JSON.stringify({ base: m.base, assets: m.assets, existing: "" }));
      if (mutation === "wrong-version") m.version = "c".repeat(64);
      text = f.encode(m);
      if (mutation === "code-not-JSON")
        text = text.replace(JSON.stringify(m), '(()=>{throw Error("must never evaluate")})()');
      if (mutation === "unexpected-prefix") text = "globalThis.unreviewed=true;" + text;
      if (mutation === "unexpected-suffix") text += "globalThis.unreviewed=true;";
      if (mutation === "duplicate-JSON-key")
        text = text.replace('{"base":"/",', '{"base":"/","base":"/",');
      await writeFile(join(f.root, "mdbase-shell-sw.js"), text);
      await assert.rejects(
        assertOfflineShell(f.root, await inventoryDirectory(f.root), f.original),
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
test("hidden/extras cannot be omitted from the independent FULL inventory", async () => {
  const f = await fixture();
  try {
    const inventory = await inventoryDirectory(f.root);
    await writeFile(join(f.root, ".hidden-extra"), "extra");
    await assert.rejects(assertOfflineShell(f.root, inventory, f.original), /inventory-mismatch/);
    const full = await inventoryDirectory(f.root);
    assert.equal(
      (await assertOfflineShell(f.root, full, f.original)).fullInventoryFiles,
      inventory.length + 1,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("offline runtime/registration are bound to original SDK-derived bytes, not only a self-consistent manifest", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, "mdbase-shell-runtime.js"), "unreviewed runtime");
    const m = f.manifest;
    m.assets.find((a) => a.path === "mdbase-shell-runtime.js").sha256 =
      digest("unreviewed runtime");
    m.version = digest(JSON.stringify({ base: "/", assets: m.assets, existing: "" }));
    await writeFile(join(f.root, "mdbase-shell-sw.js"), f.encode(m));
    await assert.rejects(
      assertOfflineShell(f.root, await inventoryDirectory(f.root), f.original),
      /original SDK-derived/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
