import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { validateBundle } from "./validate.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "reader-zotero-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const json = (name, value) => writeFile(join(root, name + ".json"), JSON.stringify(value));
  await mkdir(join(root, "files", "ATT"), { recursive: true });
  await writeFile(join(root, "files", "ATT", "file.pdf"), "abc");
  const manifest = {
    format: "dev.mdbase.reader.zotero-bundle",
    version: 1,
    status: "complete",
    warnings: [],
    counts: {
      items: 1,
      notes: 0,
      annotations: 1,
      attachments: 1,
      collections: 0,
      files: 1,
      availableAttachments: 1,
      missingAttachments: 0,
    },
    files: [
      {
        path: "files/ATT/file.pdf",
        bytes: 3,
        sha256: createHash("sha256").update("abc").digest("hex"),
      },
    ],
  };
  await json("manifest", manifest);
  await json("items", [{ key: "SOURCE", zotero: { key: "SOURCE" } }]);
  await json("notes", []);
  await json("collections", []);
  await json("annotations", [
    { key: "ANN", zotero: { key: "ANN", parentItem: "ATT", annotationPosition: "{}" } },
  ]);
  await json("attachments", [
    {
      key: "ATT",
      zotero: { key: "ATT", parentItem: "SOURCE" },
      status: "available",
      path: "files/ATT/file.pdf",
      files: ["files/ATT/file.pdf"],
    },
  ]);
  return { root, json, manifest };
}

test("validates references and SHA-256 payloads", async (t) => {
  const { root } = await fixture(t);
  assert.equal((await validateBundle(root)).checksumsVerified, 1);
});
test("rejects same-size content corruption", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "files", "ATT", "file.pdf"), "abd");
  await assert.rejects(validateBundle(root), /Checksum mismatch/);
});
test("rejects incomplete export", async (t) => {
  const { root, json, manifest } = await fixture(t);
  await json("manifest", { ...manifest, status: "failed" });
  await assert.rejects(validateBundle(root), /Incomplete/);
});
test("rejects annotation with broken attachment parent", async (t) => {
  const { root, json } = await fixture(t);
  await json("annotations", [{ key: "ANN", zotero: { key: "ANN", parentItem: "SOURCE" } }]);
  await assert.rejects(validateBundle(root), /no attachment/);
});
test("rejects payload symlinks", async (t) => {
  const { root } = await fixture(t);
  const path = join(root, "files", "ATT", "file.pdf");
  await rm(path);
  await symlink(join(root, "items.json"), path);
  await assert.rejects(validateBundle(root), /Symlink/);
});
test("rejects unlisted files", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "files", "surprise"), "x");
  await assert.rejects(validateBundle(root), /Unlisted/);
});
