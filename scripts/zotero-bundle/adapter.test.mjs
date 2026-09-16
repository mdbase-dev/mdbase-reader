import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const scope = vm.createContext({});
vm.runInContext(await readFile(new URL("./exporter.js", import.meta.url), "utf8"), scope);
function fixture({ corrupt = false, symlink = false } = {}) {
  const events = [];
  const file = (name) => ({
    path: name,
    parent: null,
    diskSpaceAvailable: 1e9,
    isSymlink: () => symlink,
    normalize() {
      this.path = path.posix.normalize(this.path);
    },
    equals(other) {
      return this.path === other.path;
    },
    contains(other) {
      return other.path.startsWith(this.path + "/");
    },
  });
  const adapter = scope.ReaderZoteroBundle.createZoteroAdapter({
    Zotero: {
      Libraries: { userLibraryID: 1 },
      File: { pathToFile: file },
      DataDirectory: { dir: "/library" },
    },
    PathUtils: { join: path.posix.join, parent: path.posix.dirname },
    IOUtils: {
      makeDirectory: async () => {},
      stat: async () => ({ size: 3, lastModified: 1 }),
      async computeHexDigest(name, algorithm) {
        assert.equal(algorithm, "sha256");
        await Promise.resolve();
        events.push("hashed " + name);
        return (corrupt && name !== "/source" ? "b" : "a").repeat(64);
      },
      async copy() {
        events.push("copied");
      },
    },
  });
  return { adapter, events };
}

test("native hashes are awaited before copying and returning the receipt", async () => {
  const { adapter, events } = fixture();
  const receipt = await adapter.copyVerified("/source", "/export", "files/ATT/file.pdf");
  assert.equal(receipt.sha256, "a".repeat(64));
  assert.equal(receipt.bytes, 3);
  assert.deepEqual(events, [
    "hashed /source",
    "copied",
    "hashed /export/files/ATT/file.pdf",
    "hashed /source",
  ]);
});
test("asynchronous hash mismatch rejects the copy", async () => {
  await assert.rejects(
    fixture({ corrupt: true }).adapter.copyVerified("/source", "/export", "file"),
    /verification failed/,
  );
});
test("preflight refuses Zotero data directory including normalized traversal", async () => {
  const { adapter } = fixture();
  for (const folder of ["/library", "/library/storage", "/outside/../library"]) {
    await assert.rejects(adapter.availableBytes(folder), /outside Zotero/);
  }
  assert.equal(await adapter.availableBytes("/library-backups"), 1e9);
  await assert.rejects(fixture({ symlink: true }).adapter.availableBytes("/elsewhere"), /Symlink/);
});
