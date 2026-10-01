import { collectionId, sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectSourceRepository } from "./source-repository.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, QueryPage, RecordDocument } from "@mdbase-dev/connect";

function success<Value>(value: Value): ConnectOutcome<Value> {
  return { ok: true, value, diagnostics: [] };
}

describe("Connect source citation metadata", () => {
  it("persists validated CSL metadata with the source revision", async () => {
    const path = "sources/crime.md";
    const citation = { id: "dostoevsky2002", type: "book", title: "Crime and Punishment" };
    const queryPages = vi.fn(() =>
      singleQueryPage({
        path,
        effectiveFrontmatter: { id: "src_01", title: "Crime and Punishment" },
        types: ["reader-source"],
        file: {},
      }),
    );
    const update = vi.fn(() =>
      Promise.resolve(
        success<RecordDocument>({
          path,
          revision: "rev-2",
          types: ["reader-source"],
          frontmatter: { id: "src_01", title: "Crime and Punishment", csl: citation },
          effectiveFrontmatter: { id: "src_01", title: "Crime and Punishment", csl: citation },
          body: "Notes",
          file: {},
        }),
      ),
    );
    const repository = new ConnectSourceRepository({
      queryPages,
      update,
    } as unknown as ReaderConnectClient);

    const updated = await repository.updateCitation({
      collectionId: collectionId("reading"),
      sourceId: sourceId("src_01"),
      citation,
    });

    expect(update).toHaveBeenCalledWith({
      path,
      patch: { csl: citation },
      includeDocument: true,
    });
    expect(updated.citation).toEqual(citation);
    expect(updated.recordRevision).toBe("rev-2");
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
