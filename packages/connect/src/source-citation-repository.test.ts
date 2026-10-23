import { connectFailure, connectProblem } from "@mdbase-dev/connect/advanced";
import { collectionId, DomainError, sourceId } from "@mdbase-reader/core";
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
  read: Mock<ReaderConnectClient["read"]>;
  setCurrent: (record: RecordDocument) => void;
} {
  let current = document(
    {
      id: "src_01",
      title: "Crime and Punishment",
      csl: citation,
      "csl-provenance": provenance,
    },
    "rev-1",
  );
  const queryPages = vi.fn(() =>
    singleQueryPage({
      path,
      effectiveFrontmatter: current.effectiveFrontmatter,
      types: ["reader-source"],
      file: {},
    }),
  );
  const update = vi.fn((request: UpdateInput) => {
    const frontmatter = { ...current.frontmatter, ...request.patch };
    for (const [key, value] of Object.entries(request.patch ?? {})) {
      if (value === null) {
        Reflect.deleteProperty(frontmatter, key);
      }
    }
    current = document(frontmatter);
    return Promise.resolve(success(current));
  });
  const read = vi.fn(() => Promise.resolve(success(current)));
  const repository = new ConnectSourceRepository({
    supportsAuthorityFeature: vi.fn(() => Promise.resolve(success(false))),
    queryPages,
    update,
    read,
  } as unknown as ReaderConnectClient);
  return {
    repository,
    update,
    read,
    setCurrent: (record) => {
      current = record;
    },
  };
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

describe("Connect citation compare-and-save", () => {
  it("compares CSL structurally and preconditions the write on the fresh revision", async () => {
    const { repository, read, update, setCurrent } = fixture();
    const author = [{ family: "Dostoevsky", given: "Fyodor" }];
    setCurrent(document({ id: "src_01", title: "Crime", csl: { ...citation, author } }, "rev-7"));
    const expectedCitation = {
      author: [{ given: "Fyodor", family: "Dostoevsky" }],
      title: citation.title,
      type: citation.type,
      id: citation.id,
    };

    const updated = await repository.updateCitation({
      ...input,
      expectedCitation,
      provenance,
    });

    expect(read).toHaveBeenCalledExactlyOnceWith({ path, includeDocument: true });
    expect(update).toHaveBeenCalledExactlyOnceWith({
      path,
      ifRevision: "rev-7",
      patch: { csl: citation, "csl-provenance": provenance },
      includeDocument: true,
    });
    expect(updated.citation).toEqual(citation);
  });

  it.each([{ ...citation, title: "Outside edit" }, { broken: true }, null, undefined])(
    "refuses to overwrite a changed or removed citation: %j",
    async (currentCitation) => {
      const { repository, update, setCurrent } = fixture();
      setCurrent(document({ id: "src_01", title: "Crime", csl: currentCitation }));
      const saved = repository.updateCitation({ ...input, expectedCitation: citation });

      await expect(saved).rejects.toBeInstanceOf(DomainError);
      await expect(saved).rejects.toMatchObject({
        code: "citation-changed-elsewhere",
        currentCitation,
      });
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("saves without a read or precondition when no baseline is supplied", async () => {
    const { repository, read, update } = fixture();

    await repository.updateCitation(input);

    expect(read).not.toHaveBeenCalled();
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("ifRevision");
  });
});

describe("Connect citation revision races", () => {
  it("rebases on unrelated frontmatter changes between the read and write", async () => {
    const { repository, read, update, setCurrent } = fixture();
    const reading = { status: "reading", position: { pdf: { page_index: 12 } } };
    update.mockImplementationOnce(() => {
      setCurrent(
        document({ id: "src_01", title: "New source title", csl: citation, reading }, "rev-3"),
      );
      return Promise.resolve(connectFailure(connectProblem("concurrent_modification", "Changed")));
    });

    const updated = await repository.updateCitation({
      ...input,
      expectedCitation: citation,
      provenance,
    });

    expect(read).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]?.[0].ifRevision).toBe("rev-1");
    expect(update.mock.calls[1]?.[0]).toEqual({
      path,
      ifRevision: "rev-3",
      patch: { csl: citation, "csl-provenance": provenance },
      includeDocument: true,
    });
    expect(updated.frontmatter["reading"]).toEqual(reading);
    expect(updated.title).toBe("New source title");
  });

  it("rechecks CSL after a revision conflict instead of overwriting an outside edit", async () => {
    const { repository, read, update, setCurrent } = fixture();
    const currentCitation = { ...citation, title: "Outside edit" };
    update.mockImplementationOnce(() => {
      setCurrent(document({ id: "src_01", title: "Crime", csl: currentCitation }, "rev-3"));
      return Promise.resolve(connectFailure(connectProblem("concurrent_modification", "Changed")));
    });

    await expect(
      repository.updateCitation({ ...input, expectedCitation: citation }),
    ).rejects.toMatchObject({ code: "citation-changed-elsewhere", currentCitation });
    expect(read).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledOnce();
  });

  it("bounds revision-conflict retries to three conditional writes", async () => {
    const { repository, read, update } = fixture();
    update.mockResolvedValue(connectFailure(connectProblem("concurrent_modification", "Changed")));

    await expect(
      repository.updateCitation({ ...input, expectedCitation: citation }),
    ).rejects.toMatchObject({ problem: { code: "concurrent_modification" } });
    expect(read).toHaveBeenCalledTimes(4);
    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls.every(([request]) => request.ifRevision === "rev-1")).toBe(true);
  });

  it("reports an outside citation edit even on the last permitted write", async () => {
    const { repository, read, update, setCurrent } = fixture();
    const currentCitation = { ...citation, title: "Outside edit" };
    update.mockImplementation(() => {
      if (update.mock.calls.length === 3) {
        setCurrent(document({ id: "src_01", title: "Crime", csl: currentCitation }, "rev-4"));
      }
      return Promise.resolve(connectFailure(connectProblem("concurrent_modification", "Changed")));
    });

    await expect(
      repository.updateCitation({ ...input, expectedCitation: citation }),
    ).rejects.toMatchObject({ code: "citation-changed-elsewhere", currentCitation });
    expect(read).toHaveBeenCalledTimes(4);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("does not retry other write failures or uncertain outcomes", async () => {
    const { repository, read, update } = fixture();
    update.mockResolvedValue(
      connectFailure(
        connectProblem("operation_outcome_unknown", "Uncertain", {
          details: { request_id: "citation-request" },
        }),
      ),
    );

    await expect(
      repository.updateCitation({ ...input, expectedCitation: citation }),
    ).rejects.toMatchObject({ problem: { code: "operation_outcome_unknown" } });
    expect(read).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it("does not write when the current record cannot be read", async () => {
    const { repository, read, update } = fixture();
    read.mockResolvedValue(connectFailure(connectProblem("file_not_found", "Missing")));

    await expect(
      repository.updateCitation({ ...input, expectedCitation: citation }),
    ).rejects.toMatchObject({ problem: { code: "file_not_found" } });
    expect(update).not.toHaveBeenCalled();
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
