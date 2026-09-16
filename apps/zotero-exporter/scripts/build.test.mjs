import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync, crc32 } from "node:zlib";
import { build, zip } from "./build.mjs";

test("XPI is reproducible and contains only the plugin and shared exporter", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "reader-xpi-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = await build(dir),
    first = await readFile(path);
  assert.deepEqual(await readFile(await build(dir)), first);
  let offset = 0;
  const files = new Map();
  while (first.readUInt32LE(offset) === 0x04034b50) {
    const length = first.readUInt32LE(offset + 18),
      nameLength = first.readUInt16LE(offset + 26);
    const start = offset + 30 + nameLength;
    const name = first.subarray(offset + 30, start).toString();
    const content = inflateRawSync(first.subarray(start, start + length));
    assert.equal(crc32(content), first.readUInt32LE(offset + 14));
    files.set(name, content);
    offset = start + length;
  }
  assert.deepEqual(
    [...files.keys()].sort(),
    [
      "bootstrap.js",
      "content/export.css",
      "content/export.js",
      "content/export.xhtml",
      "controller.js",
      "exporter.js",
      "manifest.json",
    ].sort(),
  );
  assert.equal(first.readUInt32LE(offset), 0x02014b50);
  const manifest = JSON.parse(files.get("manifest.json"));
  assert.equal(manifest.applications.zotero.id, "reader-exporter@mdbase.dev");
  assert.match(manifest.applications.zotero.update_url, /^https:\/\//);
  // Zotero 10 refuses installation without update_url, even for manual-only builds.
  assert.equal(manifest.applications.zotero.strict_max_version, "10.0.*");
  assert.deepEqual(
    files.get("exporter.js"),
    await readFile(
      new URL("../../../scripts/zotero-bundle/exporter.js", new URL("./", import.meta.url)),
    ),
  );
});
test("packager rejects traversal names", () => {
  assert.throws(() => zip([["../secret", Buffer.from("no")]]), /Unsafe/);
});
