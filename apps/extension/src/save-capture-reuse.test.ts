// @vitest-environment happy-dom
import { fileRevision, type SourceSummary } from "@mdbase-reader/core";
import { createReaderRuntimeServices } from "@mdbase-reader/platform";
import { describe, expect, it, vi } from "vitest";

import { capture, fixture } from "./testing/save-capture-fixture.js";

const hasher = createReaderRuntimeServices({
  get: () => Promise.resolve(null),
  set: () => Promise.resolve(),
  remove: () => Promise.resolve(),
}).hasher;

describe("saving without repeating lookups", () => {
  it("does not look the page up again when the panel already found nothing", async () => {
    const f = fixture();
    const list = vi.mocked(f.collection.sources.list);
    const result = await f.save({ highlight: false }, capture, { known: null, lookedUp: true });
    expect(result.existing).toBe(false);
    expect(list).not.toHaveBeenCalled();
    // Identical bytes stored meanwhile are still refused by the import.
    expect(f.findExactDuplicate).toHaveBeenCalledOnce();
  });

  it("still refuses exact duplicates when the lookup is skipped", async () => {
    const f = fixture();
    f.findExactDuplicate.mockResolvedValueOnce({ title: "[test] Elsewhere" } as SourceSummary);
    await expect(
      f.save({ highlight: false }, capture, { known: null, lookedUp: true }),
    ).rejects.toThrow("already stored");
    expect(f.commit).not.toHaveBeenCalled();
  });

  it("treats a bare null as not looked up yet", async () => {
    const f = fixture();
    const list = vi.mocked(f.collection.sources.list);
    await f.save({ highlight: false }, capture, { known: null });
    expect(list).toHaveBeenCalled();
  });

  it("looks again after an interrupted import, which may have committed", async () => {
    const f = fixture();
    const commit = f.commit.getMockImplementation();
    if (!commit) {
      throw new Error("Missing fixture commit");
    }
    f.commit.mockImplementationOnce(async (plan) => {
      await commit(plan);
      throw new Error("Response lost after commit");
    });
    await expect(
      f.save({ highlight: false }, capture, { known: null, lookedUp: true }),
    ).rejects.toThrow("Response lost");
    const retried = await f.save({ highlight: false }, capture, { known: null, lookedUp: true });
    expect(retried.existing).toBe(true);
    expect(f.commit).toHaveBeenCalledOnce();
  });
});

describe("citations written with a new source", () => {
  it("looks up colliding citekeys while the page is still importing", async () => {
    const f = fixture();
    await f.save({ highlight: false }, capture, {
      citation: { citation: { type: "article", title: "T" }, origin: "page" },
    });
    expect(f.findByCitekeyPrefix.mock.invocationCallOrder[0]).toBeLessThan(
      f.commit.mock.invocationCallOrder[0] ?? 0,
    );
    expect(f.updateCitation).toHaveBeenCalledOnce();
  });

  it("keeps the source and says so when the citekey lookup fails", async () => {
    const f = fixture();
    f.findByCitekeyPrefix.mockRejectedValueOnce(new Error("lookup offline"));
    const result = await f.save({ highlight: false }, capture, {
      citation: { citation: { type: "article", title: "T" }, origin: "page" },
    });
    expect(f.commit).toHaveBeenCalledOnce();
    expect(result.notices[0]).toContain("lookup offline");
  });
});

describe("highlights on a saved page", () => {
  it("downloads and parses the saved copy once for repeated highlights", async () => {
    const f = fixture();
    const first = await f.save({ highlight: false });
    await f.save({ comment: "one" }, capture, { known: first.source });
    await f.save(
      { comment: "two" },
      { ...capture, selection: { exact: "epsilon zeta" } },
      {
        known: first.source,
      },
    );
    expect(f.create).toHaveBeenCalledTimes(2);
    expect(f.read).toHaveBeenCalledOnce();
    // Each highlight still reads the record for its current revision.
    expect(f.collection.sources.get).toHaveBeenCalledTimes(2);
  });

  it("never anchors against an earlier revision's cached text", async () => {
    const f = fixture();
    const first = await f.save({ highlight: false });
    await f.save({ comment: "one" }, capture, { known: first.source });
    expect(f.read).toHaveBeenCalledOnce();

    const revised = new TextEncoder().encode(
      "<!doctype html><html><body><article><p>Entirely new wording here.</p></article></body></html>",
    );
    const current = (await f.collection.sources.get(f.collection.collectionId, first.source.id))!;
    const document = current.documents[0];
    if (!document) {
      throw new Error("Missing saved document");
    }
    const revision = fileRevision(await hasher.sha256(revised));
    vi.mocked(f.collection.sources.get).mockResolvedValue({
      ...current,
      documents: [{ ...document, revision }],
    });
    f.read.mockResolvedValue({
      path: "files/reading.html",
      mediaType: "text/html",
      bytes: revised,
    });

    // The passage was in the cached text, but not in the copy now stored.
    await expect(f.save({ comment: "two" }, capture, { known: first.source })).rejects.toThrow(
      "highlight is not",
    );
    expect(f.read).toHaveBeenLastCalledWith(f.collection.collectionId, document.file, revision);
    expect(f.create).toHaveBeenCalledOnce();
  });

  it("downloads instead when the uploaded bytes are not what was stored", async () => {
    const f = fixture();
    const commit = f.commit.getMockImplementation();
    if (!commit) {
      throw new Error("Missing fixture commit");
    }
    // The store normalised the copy, so its revision differs from the uploaded digest.
    const stored = new TextEncoder().encode(
      "<!doctype html><html><body><article><p>Alpha beta gamma delta epsilon zeta.</p></article></body></html>",
    );
    const revision = fileRevision(await hasher.sha256(stored));
    f.commit.mockImplementationOnce(async (plan) => {
      const source = await commit(plan);
      const document = source.documents[0];
      if (!document) {
        throw new Error("Missing saved document");
      }
      return { ...source, documents: [{ ...document, revision }] };
    });
    f.read.mockResolvedValue({ path: "files/reading.html", mediaType: "text/html", bytes: stored });
    const result = await f.save();
    expect(f.read).toHaveBeenCalledOnce();
    expect(result.annotation?.document?.revision).toBe(revision);
  });
});
