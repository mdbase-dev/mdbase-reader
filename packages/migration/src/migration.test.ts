import { describe, expect, it, vi } from "vitest";

import { hash, object, type Fields, type MigrationPlan } from "./model.js";
import { previewMigration, runMigration, type ImportedFile, type MigrationTarget } from "./run.js";
import { fixture } from "./tests/zotero-fixture.js";
import { readZoteroBundle } from "./zotero-bundle.js";
import { planZotero } from "./zotero.js";
const signal = (): AbortSignal => new AbortController().signal;
async function plan(): Promise<MigrationPlan> {
  return planZotero(await readZoteroBundle(await fixture(), signal(), vi.fn()));
}
function destination(): {
  target: MigrationTarget;
  records: Map<string, Fields>;
  files: Map<string, ImportedFile>;
  calls: string[];
} {
  const records = new Map<string, Fields>();
  const files = new Map<string, ImportedFile>();
  const calls: string[] = [];
  const target: MigrationTarget = {
    collectionId: "test-collection",
    existing: () => Promise.resolve(new Map(records)),
    files: () => Promise.resolve(new Map(files)),
    upload: async (path, blob, _mime, transferId) => {
      expect(transferId).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/u,
      );
      const digest = await hash(blob);
      const file = {
        fileId: `file-${String(files.size)}`,
        path,
        contentDigest: `sha256:${digest}`,
      };
      files.set(path, file);
      calls.push("file");
      return file;
    },
    create: (record, fields, type) => {
      records.set(record.id, fields);
      calls.push(type);
      return Promise.resolve();
    },
  };
  return { target, records, files, calls };
}
describe("Zotero validation and mapping", () => {
  it("preserves CSL, native selectors, notes, memberships, originals and stable IDs", async () => {
    const a = await plan();
    const b = await plan();
    expect(a.sources[0]?.id).toBe(b.sources[0]?.id);
    expect(a.sources[0]?.fields["csl"]).toMatchObject({ type: "book", title: "Test library" });
    expect(a.sources[0]?.fields["zotero_collections"]).toEqual([{ key: "COLL", name: "Reading" }]);
    expect(a.annotations[0]?.body).toBe("<p>Private note</p>");
    expect(a.annotations[1]?.fields["target"]).toMatchObject({
      quote: { exact: "Exact quotation" },
      zotero: { profile: "zotero-annotation-position-v1" },
    });
    expect(object(a.annotations[1]?.fields["target"])["pdf"]).toBeUndefined();
    expect(a.files).toHaveLength(7);
  });
  it("rejects corrupted payloads and unlisted files before writing", async () => {
    const input = await fixture();
    input.set("files/ATT/document.pdf", new Blob(["%PDF-wrongbytes"]));
    await expect(readZoteroBundle(input, signal(), vi.fn())).rejects.toThrow(/checksum/iu);
    const extra = await fixture();
    extra.set("secret.txt", new Blob(["not listed"]));
    await expect(readZoteroBundle(extra, signal(), vi.fn())).rejects.toThrow(/Unlisted/u);
  });
  it("rejects traversal, incomplete exports and cancelled scans", async () => {
    const input = await fixture();
    input.set("../escape", new Blob());
    await expect(readZoteroBundle(input, signal(), vi.fn())).rejects.toThrow(/Unsafe/u);
    const incomplete = await fixture();
    const m = object(JSON.parse(await incomplete.get("manifest.json")!.text()));
    m["status"] = "cancelled";
    incomplete.set("manifest.json", new Blob([JSON.stringify(m)]));
    await expect(readZoteroBundle(incomplete, signal(), vi.fn())).rejects.toThrow(/incomplete/u);
    const control = new AbortController();
    control.abort();
    await expect(readZoteroBundle(await fixture(), control.signal, vi.fn())).rejects.toThrow();
  });
  it("rejects unresolved parents", async () => {
    const input = await fixture();
    input.set(
      "notes.json",
      new Blob([JSON.stringify([{ key: "NOTE", zotero: { key: "NOTE", parentItem: "MISSING" } }])]),
    );
    await expect(readZoteroBundle(input, signal(), vi.fn())).rejects.toThrow(/parent/u);
  });
});
describe("repeatable destination-bound migration", () => {
  it("previews without writes, commits files before sources before annotations, and verifies", async () => {
    const p = await plan();
    const d = destination();
    expect(await previewMigration(p, d.target, signal())).toEqual({
      newRecords: 3,
      existingRecords: 0,
    });
    expect(d.calls).toEqual([]);
    const receipt = await runMigration(p, d.target, signal(), vi.fn());
    expect(receipt).toEqual({
      collectionId: "test-collection",
      files: 7,
      created: 3,
      skipped: 0,
      verified: 3,
    });
    expect(d.calls.slice(-3)).toEqual(["reader-source", "reader-annotation", "reader-annotation"]);
    const source = d.records.get(p.sources[0]!.id)!;
    const ann = d.records.get(p.annotations[1]!.id)!;
    expect(object((source["documents"] as Fields[])[0])).toMatchObject({
      role: "primary",
      media_type: "application/pdf",
    });
    expect(object(ann["document"])["file_id"]).toBe(
      object((source["documents"] as Fields[])[0])["file_id"],
    );
    expect(object(ann["document"])["revision"]).toBe(
      object((source["documents"] as Fields[])[0])["revision"],
    );
  });
  it("bounds concurrent uploads and waits for every file before creating records", async () => {
    const p = await plan();
    const d = destination();
    const upload = d.target.upload;
    let active = 0;
    let maximum = 0;
    vi.spyOn(d.target, "upload").mockImplementation(async (...args) => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return await upload(...args);
      } finally {
        active--;
      }
    });
    await runMigration(p, d.target, signal(), vi.fn());
    expect(maximum).toBe(3);
    expect(active).toBe(0);
    expect(d.calls.slice(0, 7)).toEqual(Array(7).fill("file"));
    expect(new Set([...d.files.values()].map((f) => f.fileId)).size).toBe(7);
  });
  it("resumes without duplicating or replacing edited records", async () => {
    const p = await plan();
    const d = destination();
    await runMigration(p, d.target, signal(), vi.fn());
    const before = d.calls.length;
    d.records.get(p.sources[0]!.id)!["title"] = "User changed title";
    const receipt = await runMigration(p, d.target, signal(), vi.fn());
    expect(receipt.created).toBe(0);
    expect(receipt.skipped).toBe(3);
    expect(d.calls).toHaveLength(before);
  });
});
describe("migration failure recovery", () => {
  it("settles sibling uploads before reporting a batch failure", async () => {
    const p = await plan();
    const d = destination();
    const upload = d.target.upload;
    let active = 0;
    vi.spyOn(d.target, "upload").mockImplementation(async (...args) => {
      active++;
      try {
        if (args[0] === p.files[0]?.path) {
          throw new Error("Fixture upload failure");
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        return await upload(...args);
      } finally {
        active--;
      }
    });
    await expect(runMigration(p, d.target, signal(), vi.fn())).rejects.toThrow(
      "Fixture upload failure",
    );
    expect(active).toBe(0);
    expect(d.records.size).toBe(0);
    expect(d.files.size).toBe(2);
  });
  it("stops on identity and byte conflicts", async () => {
    const p = await plan();
    const d = destination();
    d.records.set(p.sources[0]!.id, { import: { namespace: "other", key: "other" } });
    await expect(runMigration(p, d.target, signal(), vi.fn())).rejects.toThrow(/collision/u);
    expect(d.calls).toEqual([]);
    d.records.clear();
    d.files.set(p.files[0]!.path, {
      fileId: "foreign",
      path: p.files[0]!.path,
      contentDigest: "sha256:wrong",
    });
    await expect(runMigration(p, d.target, signal(), vi.fn())).rejects.toThrow(/different bytes/u);
  });
  it("resumes partial writes after cancellation", async () => {
    const p = await plan();
    const d = destination();
    const abort = new AbortController();
    await expect(
      runMigration(p, d.target, abort.signal, (p) => {
        if (p.completed === 1) {
          abort.abort();
        }
      }),
    ).rejects.toThrow();
    expect(d.files.size).toBeGreaterThanOrEqual(1);
    expect(d.files.size).toBeLessThanOrEqual(3);
    expect(d.records.size).toBe(0);
    const receipt = await runMigration(p, d.target, signal(), vi.fn());
    expect(receipt.verified).toBe(3);
    expect(d.files.size).toBe(7);
  });
  it("will not attach new annotations to representations removed from an existing source", async () => {
    const p = await plan();
    const d = destination();
    await runMigration(p, d.target, signal(), vi.fn());
    d.records.get(p.sources[0]!.id)!["documents"] = [];
    await expect(runMigration(p, d.target, signal(), vi.fn())).rejects.toThrow(
      /different representations/u,
    );
  });
});
