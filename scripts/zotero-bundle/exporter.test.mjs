import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const scope = vm.createContext({});
vm.runInContext(await readFile(new URL("./exporter.js", import.meta.url), "utf8"), scope);
const { exportLibrary } = scope.ReaderZoteroBundle;
const row = (key, zotero = {}) => ({ key, zotero });
function fixture() {
  const written = new Map();
  const copies = [];
  let created = false;
  const snapshot = {
    source: { library: "user:123" },
    syncing: false,
    items: [{ ...row("SOURCE", { collections: ["COLL"] }), csl: { type: "book" } }],
    notes: [row("NOTE", { parentItem: "SOURCE", note: "<p>Keep HTML</p>" })],
    annotations: [row("ANN", { parentItem: "ATT", annotationPosition: '{"pageIndex":0}' })],
    attachments: [row("ATT", { parentItem: "SOURCE" }), row("MISSING"), row("URL")],
    collections: [row("COLL")],
    fingerprints: [{ key: "SOURCE", version: 1 }],
  };
  const adapter = {
    snapshot: async () => structuredClone(snapshot),
    createDestination: async () => {
      if (created) throw new Error("exists");
      created = true;
    },
    writeJSON: async (_, name, value) => written.set(name, JSON.parse(JSON.stringify(value))),
    attachmentFiles: async (key) =>
      key === "ATT"
        ? {
            status: "available",
            primary: "page.html",
            files: [
              { source: "local", relative: "page.html" },
              { source: "asset", relative: "assets/image.png" },
            ],
          }
        : { status: key === "URL" ? "linked-url" : "missing-file" },
    copyVerified: async (_, __, path) => {
      copies.push(path);
      return { bytes: 3, sha256: "a".repeat(64) };
    },
  };
  return { adapter, snapshot, written, copies };
}

test("preserves raw notes, selectors, collections, files and missing-file diagnostics", async () => {
  const f = fixture();
  const m = await exportLibrary(f.adapter, { destination: "test" });
  assert.equal(m.status, "complete-with-warnings");
  assert.equal(m.counts.availableAttachments, 1);
  assert.equal(m.counts.missingAttachments, 1);
  assert.deepEqual(f.copies, ["files/ATT/page.html", "files/ATT/assets/image.png"]);
  assert.equal(f.written.get("notes.json")[0].zotero.note, "<p>Keep HTML</p>");
  assert.equal(f.written.get("annotations.json")[0].zotero.annotationPosition, '{"pageIndex":0}');
  assert.equal(f.written.get("attachments.json")[2].status, "linked-url");
  await assert.rejects(exportLibrary(f.adapter, { destination: "test" }), /exists/);
});

test("refuses active sync before creating a destination", async () => {
  const f = fixture();
  f.snapshot.syncing = true;
  await assert.rejects(exportLibrary(f.adapter, { destination: "test" }), /sync/);
  assert.equal(f.written.size, 0);
});

test("warnings include exported titles without changing codes, keys or parent identities", async () => {
  const fixtureData = fixture();
  fixtureData.snapshot.items[0].csl = null;
  fixtureData.snapshot.items[0].zotero.title = "  A source title  ";
  fixtureData.snapshot.notes[0].zotero.parentItem = "TRASHED";
  fixtureData.snapshot.annotations[0].zotero.parentItem = "MISSING-ATTACHMENT";
  fixtureData.snapshot.annotations[0].zotero.annotationText = "Annotated passage";
  fixtureData.snapshot.attachments[1].zotero.title = "<b>Attachment title</b>";
  const manifest = await exportLibrary(fixtureData.adapter, { destination: "test" });
  assert.deepEqual(JSON.parse(JSON.stringify(manifest.warnings)), [
    { code: "missing-parent", key: "NOTE", parent: "TRASHED" },
    {
      code: "missing-parent",
      key: "ANN",
      parent: "MISSING-ATTACHMENT",
      title: "Annotated passage",
    },
    { code: "csl-unavailable", key: "SOURCE", title: "A source title" },
    { code: "missing-file", key: "MISSING", title: "<b>Attachment title</b>" },
  ]);
  assert.deepEqual(
    fixtureData.written.get("manifest.json").warnings,
    JSON.parse(JSON.stringify(manifest.warnings)),
  );
  assert.equal(fixtureData.written.get("items.json")[0].zotero.title, "  A source title  ");
});

test("warning titles can fall back to CSL without including raw note HTML", async () => {
  const fixtureData = fixture();
  fixtureData.snapshot.items[0].zotero.parentItem = "MISSING-PARENT";
  fixtureData.snapshot.items[0].zotero.title = " ";
  fixtureData.snapshot.items[0].csl.title = "CSL source title";
  fixtureData.snapshot.notes[0].zotero.parentItem = "MISSING-PARENT";
  const manifest = await exportLibrary(fixtureData.adapter, { destination: "test" });
  assert.equal(
    manifest.warnings.find((warning) => warning.key === "SOURCE").title,
    "CSL source title",
  );
  assert.equal(manifest.warnings.find((warning) => warning.key === "NOTE").title, undefined);
});

for (const relative of [
  "../escape",
  "/absolute",
  "assets/../../escape",
  "bad\\name",
  "a//b",
  "C:/escape",
]) {
  test(`refuses unsafe payload path ${relative}`, async () => {
    const f = fixture();
    f.adapter.attachmentFiles = async () => ({
      status: "available",
      primary: relative,
      files: [{ source: "s", relative }],
    });
    await assert.rejects(exportLibrary(f.adapter, { destination: "test" }), /Unsafe/);
    assert.equal(f.written.get("manifest.json").status, "failed");
    assert.equal(f.copies.length, 0);
  });
}

test("records interrupted copy as failure, never completion", async () => {
  const f = fixture();
  f.adapter.copyVerified = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(exportLibrary(f.adapter, { destination: "test" }), /disk full/);
  assert.equal(f.written.get("manifest.json").status, "failed");
});

test("detects library changes during export", async () => {
  const f = fixture();
  await assert.rejects(
    exportLibrary(f.adapter, {
      destination: "test",
      onProgress: () => {
        f.snapshot.fingerprints[0].version++;
      },
    }),
    /Library changed/,
  );
  assert.equal(f.written.get("manifest.json").status, "failed");
});

test("cancellation leaves a visibly incomplete bundle", async () => {
  const f = fixture();
  const controller = new AbortController();
  await assert.rejects(
    exportLibrary(f.adapter, {
      destination: "test",
      signal: controller.signal,
      onProgress: () => controller.abort(),
    }),
    /cancelled/,
  );
  assert.equal(f.written.get("manifest.json").status, "cancelled");
});

test("rejects unresolved collection membership", async () => {
  const f = fixture();
  f.snapshot.collections = [];
  await assert.rejects(exportLibrary(f.adapter, { destination: "test" }), /collection membership/);
});
