import { connectFailure, connectProblem } from "@mdbase-dev/connect/advanced";
import {
  collectionId,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type SourceId,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { sourceFromDocument, sourceSummaryFromQuery } from "./mapping.js";
import { documentRangePatch, sourcePartOfPatch } from "./source-frontmatter.js";
import { withResolvedSourceParts } from "./source-part-links.js";
import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  ConnectOutcome,
  QueryInput,
  QueryPage,
  RecordDocument,
  UpdateInput,
} from "@mdbase-dev/connect";
import type { Mock } from "vitest";

const collection = collectionId("parts");
const child = sourceId("chapter"),
  parent = sourceId("book"),
  volume = sourceId("volume");
const document = {
  file_id: "shared",
  file: "[[files/book.pdf]]",
  revision: "sha256:aaaaaa",
  media_type: "application/pdf",
  role: "primary",
  future: { keep: true },
};
const range = { kind: "pages" as const, start: 0, end: 9 };
const base = {
  collectionId: collection,
  sourceId: child,
  expectedRevision: recordRevision("rev-1"),
};
function success<T>(value: T): ConnectOutcome<T> {
  return { ok: true, value, diagnostics: [] };
}
function record(id: string, fields: Record<string, unknown> = {}): RecordDocument {
  const frontmatter = { id, title: id, ...fields };
  return {
    path: `sources/${id}.md`,
    revision: "rev-1",
    frontmatter,
    effectiveFrontmatter: frontmatter,
    body: "Untouched notes",
    types: ["reader-source"],
    file: {},
  };
}
function fixture(): {
  repository: ConnectSourceRepository;
  records: Map<SourceId, RecordDocument>;
  queryPages: Mock<(input: QueryInput) => AsyncIterable<ConnectOutcome<QueryPage>>>;
  read: Mock<ReaderConnectClient["read"]>;
  update: Mock<ReaderConnectClient["update"]>;
} {
  const records = new Map([
    [
      child,
      record(child, {
        documents: [document],
        unrelated: { keep: true },
        relations: [{ relation: "cites", target: "[[elsewhere]]", extra: 17 }],
      }),
    ],
    [parent, record(parent)],
    [volume, record(volume)],
  ]);
  const targetId = (entry: unknown): string | undefined => {
    const target = (entry as { target?: string } | null)?.target;
    // This is the test authority, not Reader's resolver: arbitrary alias/short filename links resolve here.
    return target === "[[short-name|Renamed book]]"
      ? parent
      : [...records.keys()].find((id) => target?.startsWith(`[[sources/${id}|`));
  };
  const queryPages = vi.fn((input: QueryInput) =>
    (async function* (): AsyncIterable<ConnectOutcome<QueryPage>> {
      await Promise.resolve();
      const recordsToReturn = [...records.values()].filter((item) => {
        if (input.where?.startsWith("id == ")) {
          return item.frontmatter["id"] === JSON.parse(input.where.slice(6));
        }
        if (input.where?.startsWith("file.path == ")) {
          return item.path === JSON.parse(input.where.slice(13));
        }
        if (input.where?.includes(".exists(")) {
          return (item.frontmatter["relations"] as unknown[] | undefined)?.some(
            (entry) =>
              (entry as { relation?: string }).relation === "part-of" && targetId(entry) === parent,
          );
        }
        return true;
      });
      yield success({
        page: 1,
        offset: 0,
        loaded: recordsToReturn.length,
        complete: true,
        results: recordsToReturn.map((item) => ({
          ...item,
          values: {
            reader_part_of_ids: input.projections
              ? ((item.frontmatter["relations"] as { relation: string }[] | undefined)
                  ?.filter((entry) => entry.relation === "part-of")
                  .map((entry) => targetId(entry) ?? null) ?? [])
              : [],
          },
        })),
      });
    })(),
  );
  const read = vi.fn(({ path }: { path: string }) =>
    Promise.resolve(success([...records.values()].find((item) => item.path === path)!)),
  );
  const update = vi.fn((input: UpdateInput) => {
    const current = [...records.values()].find((item) => item.path === input.path)!;
    if (input.ifRevision !== current.revision) {
      return Promise.resolve(connectFailure(connectProblem("concurrent_modification", "Moved on")));
    }
    const frontmatter = { ...current.frontmatter, ...input.patch };
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === null) {
        Reflect.deleteProperty(frontmatter, key);
      }
    }
    const updated = {
      ...current,
      frontmatter,
      effectiveFrontmatter: frontmatter,
      revision: "rev-2",
    };
    records.set(sourceId(String(current.frontmatter["id"])), updated);
    return Promise.resolve(success(updated));
  });
  const client = {
    queryPages,
    read,
    update,
    supportsAuthorityFeature: vi.fn(() => Promise.resolve(success(false))),
  } as unknown as ReaderConnectClient;
  return { repository: new ConnectSourceRepository(client), records, queryPages, read, update };
}

describe("source part frontmatter round trips", () => {
  it("preserves unknown document and unrelated relation properties", () => {
    const opaque = { kind: "future-kind", custom: 42 };
    const fields = {
      documents: [
        { ...document, range: opaque },
        { ...document, file_id: "other", future: 1 },
      ],
      relations: [
        { relation: "cites", target: "[[a]]", extra: { x: 1 } },
        { relation: "part-of", target: "[[old]]", extra: "keep" },
      ],
    };
    expect(
      sourceFromDocument(collection, record(child, fields)).documents[0]?.range,
    ).toBeUndefined();
    const related = { ...fields, ...sourcePartOfPatch(fields, "[[new]]") };
    expect(related.documents[0]).toMatchObject({ range: opaque });
    expect(related.relations).toEqual([
      fields.relations[0],
      { ...fields.relations[1], target: "[[new]]" },
    ]);
    const patched = {
      ...related,
      ...documentRangePatch(related, fileId("shared"), fileRevision("sha256:aaaaaa"), range),
    };
    const mapped = sourceFromDocument(collection, record(child, patched));
    expect(mapped.documents[0]?.range).toEqual(range);
    expect((patched.documents as unknown[])[1]).toEqual(fields.documents[1]);
    expect((patched.documents as Record<string, unknown>[])[0]?.["future"]).toEqual({ keep: true });
    expect(
      documentRangePatch(patched, fileId("shared"), fileRevision("sha256:aaaaaa"), null),
    ).toEqual({ documents: [document, fields.documents[1]] });
    expect(sourcePartOfPatch(patched, null)).toEqual({ relations: [fields.relations[0]] });
  });
  it("retains extension metadata even when existing parent relations are duplicated", () => {
    const fields = {
      relations: [
        { relation: "part-of", target: "[[old]]", future: 1 },
        { relation: "part-of", target: "[[old]]", future: 2 },
      ],
    };
    expect(sourcePartOfPatch(fields, "[[new]]")).toEqual({
      relations: fields.relations.map((entry) => ({ ...entry, target: "[[new]]" })),
    });
    expect(sourcePartOfPatch(fields, null)).toEqual({ relations: null });
  });

  it("maps a resolved ID only from the authority's projection", () => {
    const raw = record(child, {
      relations: [{ relation: "part-of", target: "[[short-name|Renamed book]]" }],
    });
    expect(sourceSummaryFromQuery(collection, raw).partOf).toBeUndefined();
    expect(
      sourceSummaryFromQuery(collection, { ...raw, values: { reader_part_of_ids: [parent] } })
        .partOf,
    ).toBe(parent);
    expect(withResolvedSourceParts({ select: ["title"] }).select).toEqual([
      "title",
      "projection.reader_part_of_ids",
    ]);
  });
});

describe("Connect source part repository", () => {
  it("sets and clears a parent with a record revision guard and preserves other fields", async () => {
    const { repository, update } = fixture();
    const saved = await repository.setSourcePartOf({ ...base, parentId: parent });
    expect(saved.partOf).toBe(parent);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        ifRevision: "rev-1",
        patch: {
          relations: [
            { relation: "cites", target: "[[elsewhere]]", extra: 17 },
            { relation: "part-of", target: "[[sources/book|book]]" },
          ],
        },
      }),
    );
    expect(saved.frontmatter["unrelated"]).toEqual({ keep: true });
    expect(saved.body).toBe("Untouched notes");
    const cleared = await repository.setSourcePartOf({
      ...base,
      expectedRevision: saved.recordRevision,
      parentId: null,
    });
    expect(cleared.partOf).toBeUndefined();
    expect(cleared.relations).toHaveLength(1);
  });
  it("sets and clears a range only at the expected record and file revisions", async () => {
    const { repository, update } = fixture();
    const input = {
      ...base,
      documentFileId: fileId("shared"),
      expectedDocumentRevision: fileRevision("sha256:aaaaaa"),
      range,
    };
    await expect(
      repository.setDocumentRange({
        ...input,
        expectedDocumentRevision: fileRevision("sha256:bbbbbb"),
      }),
    ).rejects.toThrow(/Document revision changed/u);
    await expect(
      repository.setDocumentRange({ ...input, range: { kind: "pages", start: 10, end: 0 } }),
    ).rejects.toThrow(/Invalid document range/u);
    expect(update).not.toHaveBeenCalled();
    const saved = await repository.setDocumentRange(input);
    expect(saved.documents[0]?.range).toEqual(range);
    expect(saved.frontmatter["documents"]).toEqual([{ ...document, range }]);
    await expect(repository.setDocumentRange(input)).rejects.toThrow(/Source revision changed/u);
    const cleared = await repository.setDocumentRange({
      ...input,
      expectedRevision: saved.recordRevision,
      range: null,
    });
    expect(cleared.frontmatter["documents"]).toEqual([document]);
  });
  it("does not overwrite a raced record", async () => {
    const { repository, records, update } = fixture();
    update.mockImplementationOnce(() => {
      records.set(child, { ...records.get(child)!, revision: "rev-raced" });
      return Promise.resolve(connectFailure(connectProblem("concurrent_modification", "Moved on")));
    });
    await expect(repository.setSourcePartOf({ ...base, parentId: parent })).rejects.toThrow(
      /Moved on/u,
    );
    expect(update).toHaveBeenCalledOnce();
  });
});

describe("Connect source part traversal", () => {
  it("detects self references, cycles and allows multi-level chains", async () => {
    const { repository, records, update } = fixture();
    await expect(repository.setSourcePartOf({ ...base, parentId: child })).rejects.toThrow(
      /self-reference/u,
    );
    records.set(
      parent,
      record(parent, {
        relations: [{ relation: "part-of", target: "[[sources/chapter|chapter]]" }],
      }),
    );
    await expect(repository.setSourcePartOf({ ...base, parentId: parent })).rejects.toThrow(
      /cycle/u,
    );
    expect(update).not.toHaveBeenCalled();
    records.set(
      parent,
      record(parent, { relations: [{ relation: "part-of", target: "[[sources/volume|volume]]" }] }),
    );
    await repository.setSourcePartOf({ ...base, parentId: parent });
    expect(await repository.validatePartOf(collection, child)).toEqual({
      ancestors: [parent, volume],
    });
    records.set(
      volume,
      record(volume, { relations: [{ relation: "part-of", target: "[[sources/book|book]]" }] }),
    );
    expect(await repository.validatePartOf(collection, child)).toMatchObject({ problem: "cycle" });
  });
  it("bounds deep ancestry reads", async () => {
    const { repository, records, read } = fixture();
    for (let index = 0; index < 35; index += 1) {
      const id = sourceId(`chain-${String(index)}`);
      records.set(
        id,
        record(id, {
          relations: [
            { relation: "part-of", target: `[[sources/chain-${String(index + 1)}|Next]]` },
          ],
        }),
      );
    }
    expect(await repository.validatePartOf(collection, sourceId("chain-0"))).toMatchObject({
      problem: "depth-exceeded",
    });
    expect(read.mock.calls.length).toBeLessThanOrEqual(33);
  });

  it("tolerates missing parents without inventing an ID from the link", async () => {
    const { repository, records } = fixture();
    records.set(
      child,
      record(child, { relations: [{ relation: "part-of", target: "[[missing]]" }] }),
    );
    expect((await repository.get(collection, child))?.partOf).toBeUndefined();
    expect((await repository.get(collection, child))?.relations?.[0]?.target).toBe("[[missing]]");
    expect(await repository.validatePartOf(collection, child)).toEqual({ ancestors: [] });
  });
  it("keeps semantic contract queries projection-free and batch-resolves library parent links", async () => {
    const { repository, records, queryPages } = fixture();
    records.set(
      child,
      record(child, {
        relations: [{ relation: "part-of", target: "[[short-name|Renamed book]]" }],
      }),
    );
    const pages = [];
    for await (const page of repository.listPages({ collectionId: collection, limit: 100 })) {
      pages.push(page);
    }
    expect(pages[0]?.items.find((source) => source.id === child)?.partOf).toBe(parent);
    expect(queryPages).toHaveBeenCalledTimes(2);
    expect(queryPages.mock.calls[0]?.[0]).not.toHaveProperty("projections");
    expect(queryPages.mock.calls[0]?.[0]).toHaveProperty("contract");
    expect(queryPages.mock.calls[1]?.[0]).not.toHaveProperty("contract");
    expect(queryPages.mock.calls[1]?.[0].where).toBe('file.path in ["sources/chapter.md"]');
  });

  it("lists parts with one paginated authority query, resolving aliases instead of comparing link text", async () => {
    const { repository, records, queryPages, read } = fixture();
    records.set(
      child,
      record(child, {
        documents: [document],
        relations: [{ relation: "part-of", target: "[[short-name|Renamed book]]" }],
      }),
    );
    const parts = await repository.sourceParts(collection, parent);
    expect(parts.map((source) => source.id)).toEqual([child]);
    expect(parts[0]?.partOf).toBe(parent);
    expect(queryPages).toHaveBeenCalledOnce();
    expect(queryPages.mock.calls[0]?.[0].where).toContain(
      'r.target.asFile().?id.orValue(null) == "book"',
    );
    expect(read).not.toHaveBeenCalled();
  });
});
