import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage, RecordDocument, UpdateInput } from "@mdbase-dev/connect";
import type { Mock } from "vitest";

const path = "sources/crime.md";
const citation = { id: "dostoevsky2002", type: "book", title: "Crime and Punishment" };
const provenance = { title: { value: citation.title, source: "page:html" } };
const input = {
  collectionId: collectionId("reading"),
  sourceId: sourceId("src_01"),
  citation,
};

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

function fixture(): {
  repository: ConnectSourceRepository;
  update: Mock<ReaderConnectClient["update"]>;
} {
  let frontmatter: Record<string, unknown> = {
    id: "src_01",
    title: "Crime and Punishment",
    csl: citation,
    "csl-provenance": provenance,
  };
  const queryPages = vi.fn(() =>
    singleQueryPage({
      path,
      effectiveFrontmatter: frontmatter,
      types: ["reader-source"],
      file: {},
    }),
  );
  const update = vi.fn((request: UpdateInput) => {
    frontmatter = { ...frontmatter, ...request.patch };
    for (const [key, value] of Object.entries(request.patch ?? {})) {
      if (value === null) {
        Reflect.deleteProperty(frontmatter, key);
      }
    }
    return Promise.resolve(success(document(frontmatter)));
  });
  const repository = new ConnectSourceRepository({
    supportsAuthorityFeature: vi.fn(() => Promise.resolve(success(false))),
    queryPages,
    update,
  } as unknown as ReaderConnectClient);
  return { repository, update };
}

function document(frontmatter: Record<string, unknown>, revision = "rev-2"): RecordDocument {
  return {
    path,
    revision,
    types: ["reader-source"],
    frontmatter,
    effectiveFrontmatter: frontmatter,
    body: "Notes",
    file: {},
  };
}

describe("Connect source citation metadata", () => {
  it("persists validated CSL without touching omitted provenance", async () => {
    const { repository, update } = fixture();
    const updated = await repository.updateCitation(input);

    expect(update).toHaveBeenCalledWith({
      path,
      patch: { csl: citation },
      includeDocument: true,
    });
    expect(updated.citation).toEqual(citation);
    expect(updated.cslProvenance).toEqual(provenance);
    expect(updated.recordRevision).toBe("rev-2");
  });

  it("writes CSL and provenance in one patch", async () => {
    const { repository, update } = fixture();
    const nextProvenance = { title: { value: citation.title, source: "registry:doi.org" } };
    const updated = await repository.updateCitation({ ...input, provenance: nextProvenance });

    expect(update).toHaveBeenCalledExactlyOnceWith({
      path,
      patch: { csl: citation, "csl-provenance": nextProvenance },
      includeDocument: true,
    });
    expect(updated.citation).toEqual(citation);
    expect(updated.cslProvenance).toEqual(nextProvenance);
  });

  it("removes the sibling key when provenance is explicitly empty", async () => {
    const { repository, update } = fixture();
    const updated = await repository.updateCitation({ ...input, provenance: {} });

    expect(update).toHaveBeenCalledExactlyOnceWith({
      path,
      patch: { csl: citation, "csl-provenance": null },
      includeDocument: true,
    });
    expect(updated.frontmatter).not.toHaveProperty("csl-provenance");
    expect(updated.cslProvenance).toBeUndefined();
    expect(updated.citation).toEqual(citation);
  });
});

async function* singleQueryPage(
  record: QueryPage["results"][number],
): AsyncGenerator<ConnectOutcome<QueryPage>> {
  yield await Promise.resolve(
    success({
      results: [record],
      page: 0,
      offset: 0,
      loaded: 1,
      complete: true,
    }),
  );
}
