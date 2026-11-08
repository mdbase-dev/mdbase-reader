import { describe, expect, it, vi } from "vitest";

import { identity, object, type Fields, type MigrationPlan } from "./model.js";
import { readwiseAnnotations } from "./readwise-annotations.js";
import { readwiseSource } from "./readwise-sources.js";
import { SkipTally } from "./readwise-values.js";
import { previewMigration, runMigration, type MigrationTarget } from "./run.js";
import { readerBook, readerDocument, readerHighlight } from "./tests/readwise-fixture.js";

import type { Mock } from "vitest";

const signal = (): AbortSignal => new AbortController().signal;
interface Scan {
  linked?: boolean;
  reader?: boolean;
  classic?: boolean;
}

async function scan({
  linked = true,
  reader = true,
  classic = true,
}: Scan = {}): Promise<MigrationPlan> {
  const plan: MigrationPlan = {
    service: "readwise",
    namespace: "readwise:reader",
    files: [],
    sources: [await readwiseSource(readerDocument, "readwise:reader")],
    annotations: [],
    warnings: [],
    summary: { sources: 1, notes: 0, annotations: 0, files: 0, bytes: 0 },
  };
  const highlight = object((readerBook["highlights"] as Fields[])[0]);
  const books = classic
    ? [
        {
          ...readerBook,
          highlights: [{ ...highlight, external_id: linked ? readerHighlight["id"]! : null }],
        },
      ]
    : [];
  await readwiseAnnotations(
    plan,
    reader ? [readerDocument, readerHighlight] : [readerDocument],
    books,
    new SkipTally(),
  );
  return plan;
}

function destination(): {
  records: Map<string, Fields>;
  target: MigrationTarget;
  create: Mock<MigrationTarget["create"]>;
} {
  const records = new Map<string, Fields>();
  const create = vi.fn<MigrationTarget["create"]>((record, fields) => {
    records.set(record.id, structuredClone(fields));
    return Promise.resolve();
  });
  const target: MigrationTarget = {
    collectionId: "fixture",
    existing: () => Promise.resolve(new Map(records)),
    files: () => Promise.resolve(new Map()),
    upload: () => Promise.reject(new Error("No files expected")),
    create,
  };
  return { records, target, create };
}

describe("Readwise highlight import identities", () => {
  it("keeps the v2 identity when Reader linkage or counterpart availability changes", async () => {
    const linked = await scan();
    for (const variant of [
      await scan({ linked: false }),
      await scan({ reader: false }),
      await scan({ linked: false, reader: false }),
    ]) {
      expect(variant.annotations).toHaveLength(1);
      expect(variant.annotations[0]?.id).toBe(linked.annotations[0]?.id);
      expect(variant.annotations[0]?.key).toBe("v2:9001");
    }
  });

  it.each([
    [{ linked: false }, {}],
    [{}, { linked: false }],
    [{ reader: false }, {}],
    [{}, { reader: false }],
    [{ classic: false }, {}],
    [{}, { classic: false }],
    [{ linked: false }, { classic: false }],
    [{ classic: false }, { linked: false }],
  ] satisfies [Scan, Scan][])(
    "deduplicates changed scans %j -> %j without rewriting existing data",
    async (first, second) => {
      const { records, target, create } = destination();
      await runMigration(await scan(first), target, signal(), vi.fn());
      const stored = structuredClone([...records]);
      const next = await scan(second);
      expect(await previewMigration(next, target, signal())).toEqual({
        newRecords: 0,
        existingRecords: 2,
      });
      expect(await runMigration(next, target, signal(), vi.fn())).toMatchObject({
        created: 0,
        skipped: 2,
        verified: 2,
      });
      expect([...records]).toEqual(stored);
      expect(create).toHaveBeenCalledTimes(2);
    },
  );
});

describe("legacy Readwise highlight identities", () => {
  it.each([true, false])(
    "recognizes previously imported legacy linked highlights, linkage now %j",
    async (linked) => {
      const { records, target } = destination();
      const legacy = await scan();
      const annotation = legacy.annotations[0]!;
      const key = readerHighlight["id"] as string;
      annotation.key = key;
      annotation.id = await identity(legacy.namespace, key, "ann");
      annotation.path = `annotations/imports/${annotation.id}.md`;
      object(annotation.fields["import"])["key"] = key;
      delete object(annotation.fields["import"])["aliases"];
      await runMigration(legacy, target, signal(), vi.fn());
      const stored = structuredClone([...records]);
      expect(
        await runMigration(await scan({ linked, reader: linked }), target, signal(), vi.fn()),
      ).toMatchObject({ created: 0, verified: 2 });
      expect([...records]).toEqual(stored);
    },
  );

  it("reads archived external IDs from legacy unlinked imports when the Reader row returns", async () => {
    const { target, records } = destination();
    const legacy = await scan({ reader: false });
    delete object(legacy.annotations[0]!.fields["import"])["aliases"];
    await runMigration(legacy, target, signal(), vi.fn());
    expect(
      await runMigration(await scan({ classic: false }), target, signal(), vi.fn()),
    ).toMatchObject({ created: 0, verified: 2 });
    expect(records.size).toBe(2);
  });
});

describe("Readwise identity collisions", () => {
  it("refuses ambiguous legacy duplicates instead of importing or deleting anything", async () => {
    const { target, records, create } = destination();
    const plan = await scan();
    await runMigration(plan, target, signal(), vi.fn());
    const annotation = plan.annotations[0]!;
    const duplicate = structuredClone(records.get(annotation.id)!);
    const key = readerHighlight["id"] as string;
    const id = await identity(plan.namespace, key, "ann");
    duplicate["id"] = id;
    object(duplicate["import"])["key"] = key;
    records.set(id, duplicate);
    const stored = structuredClone([...records]);
    await expect(previewMigration(plan, target, signal())).rejects.toThrow(
      "Import identity collision",
    );
    await expect(runMigration(plan, target, signal(), vi.fn())).rejects.toThrow(
      "Import identity collision",
    );
    expect([...records]).toEqual(stored);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("refuses conflicting planned aliases before writing anything", async () => {
    const { target, create } = destination();
    const plan = await scan();
    const duplicate = structuredClone(plan.annotations[0]!);
    duplicate.key = "v2:another-highlight";
    duplicate.id = await identity(plan.namespace, duplicate.key, "ann");
    duplicate.path = `annotations/imports/${duplicate.id}.md`;
    object(duplicate.fields["import"])["key"] = duplicate.key;
    plan.annotations.push(duplicate);
    await expect(runMigration(plan, target, signal(), vi.fn())).rejects.toThrow(
      "Import identity collision",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["source", "namespace"])(
    "rejects an aliased legacy record with a different %s",
    async (field) => {
      const { target, records, create } = destination();
      const old = await scan({ classic: false });
      await runMigration(old, target, signal(), vi.fn());
      const fields = records.get(old.annotations[0]!.id)!;
      if (field === "source") {
        fields["source"] = "[[another-source]]";
      } else {
        object(fields["import"])["namespace"] = "readwise:another-account";
      }
      const next = await scan();
      if (field === "namespace") {
        records.delete(old.annotations[0]!.id);
        records.set(next.annotations[0]!.id, fields);
      }
      await expect(runMigration(next, target, signal(), vi.fn())).rejects.toThrow(
        "Import identity collision",
      );
      expect(create).toHaveBeenCalledTimes(2);
    },
  );

  it("does not guess an identity from a matching quote across unlinked APIs", async () => {
    const { target, records } = destination();
    await runMigration(await scan({ reader: false, linked: false }), target, signal(), vi.fn());
    const separate = await scan({ classic: false });
    const row = { ...readerHighlight, id: "different-highlight" };
    separate.annotations = [];
    await readwiseAnnotations(separate, [readerDocument, row], [], new SkipTally());
    await expect(runMigration(separate, target, signal(), vi.fn())).rejects.toThrow(
      "Import identity collision",
    );
    expect(records.size).toBe(2);
  });
});

describe("Readwise identity history", () => {
  it("does not duplicate an old unlinked highlight after linkage appears then the v2 row disappears", async () => {
    const { target, records, create } = destination();
    await runMigration(await scan({ reader: false, linked: false }), target, signal(), vi.fn());
    expect(await runMigration(await scan(), target, signal(), vi.fn())).toMatchObject({
      created: 0,
    });
    await expect(
      runMigration(await scan({ classic: false }), target, signal(), vi.fn()),
    ).rejects.toThrow("Import identity collision");
    expect(records.size).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps distinct Reader IDs separate even when their quotes match", async () => {
    const { target, records } = destination();
    await runMigration(await scan({ classic: false }), target, signal(), vi.fn());
    const separate = await scan({ classic: false });
    separate.annotations = [];
    await readwiseAnnotations(
      separate,
      [readerDocument, { ...readerHighlight, id: "different-highlight" }],
      [],
      new SkipTally(),
    );
    expect(await runMigration(separate, target, signal(), vi.fn())).toMatchObject({ created: 1 });
    expect(records.size).toBe(3);
  });
});
