// @vitest-environment happy-dom
import {
  collectionId,
  fileId,
  fileRevision,
  recordRevision,
  type Annotation,
  type PlannedSourceFileImport,
  type Source,
} from "@mdbase-reader/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureWriter, type CaptureDraft, type SavedCapture } from "./save-capture.js";

import type { SelectedWebCapture } from "./page-capture.js";
import type {
  ReaderConnectedCollection,
  ReaderPortableApplicationSession,
} from "@mdbase-reader/connect";

const capture: SelectedWebCapture = {
  submittedUrl: "https://example.com/article",
  canonicalUrl: "https://example.com/article",
  retrievedAt: "2026-09-23T12:00:00.000Z",
  pageTitle: "[test] Article",
  html: "<!doctype html><html><head><title>[test] Article</title></head><body><article><p>Alpha beta <em>gamma delta</em> epsilon zeta.</p></article></body></html>",
  selection: { exact: "beta gamma", prefix: "Alpha ", suffix: " delta" },
};
const draft: CaptureDraft = {
  title: "[test] Edited title",
  tags: "research, test, research",
  note: "Keep **this note**.",
  comment: "A useful passage.",
  highlight: true,
};

// The fixture intentionally exposes inferred Vitest mock signatures for assertions.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fixture() {
  let source: Source | null = null;
  let bytes = new Uint8Array();
  const annotations = new Map<string, Annotation>();
  const commit = vi.fn((plan: PlannedSourceFileImport) => {
    const primary = plan.representations[0]!;
    bytes = new Uint8Array(primary.bytes);
    source = {
      id: plan.sourceId,
      collectionId: plan.collectionId,
      path: plan.recordPath,
      title: plan.title,
      tags: plan.tags ?? [],
      creators: [],
      url: capture.canonicalUrl,
      body: plan.body ?? "",
      frontmatter: {},
      recordRevision: recordRevision("revision-1"),
      documents: [
        {
          fileId: fileId("test-file"),
          file: "[[files/reading.html]]",
          revision: fileRevision(primary.contentDigest),
          role: "primary",
          mediaType: "text/html",
        },
      ],
    };
    return Promise.resolve(source);
  });
  const create = vi.fn((annotation: Annotation) => {
    annotations.set(annotation.id, annotation);
    return Promise.resolve(annotation);
  });
  const read = vi.fn(() =>
    Promise.resolve({ path: "files/reading.html", mediaType: "text/html", bytes }),
  );
  const collection = {
    collectionId: collectionId("[test] library"),
    sources: {
      list: vi.fn(() => Promise.resolve({ items: source ? [source] : [] })),
      get: vi.fn(() => Promise.resolve(source)),
    },
    sourceImports: { findExactDuplicate: vi.fn(() => Promise.resolve(null)), commitFile: commit },
    files: { read },
    annotations: {
      create,
      get: vi.fn((_collection: string, id: string) => Promise.resolve(annotations.get(id) ?? null)),
      listForSource: vi.fn(() => Promise.resolve([...annotations.values()])),
    },
  } as unknown as ReaderConnectedCollection;
  const session = {
    recoverPendingMutations: vi.fn(() => Promise.resolve([])),
  } as unknown as ReaderPortableApplicationSession;
  const onSource = vi.fn();
  const writer = new CaptureWriter();
  const save = (changes: Partial<CaptureDraft> = {}, page = capture): Promise<SavedCapture> =>
    writer.save({
      session,
      collection,
      capture: page,
      draft: { ...draft, ...changes },
      onSource,
      onProgress: vi.fn(),
    });
  return { save, collection, session, commit, create, read, onSource, annotations };
}

beforeEach(() => localStorage.clear());
describe("explicit source and highlight saves", () => {
  it("saves title, tags and authored note, then anchors the highlight to verified stored bytes", async () => {
    const f = fixture();
    const result = await f.save();
    expect(result.source.title).toBe(draft.title);
    expect(result.source.tags).toEqual(["research", "test"]);
    expect(f.commit.mock.calls[0]?.[0].body).toContain("Keep **this note**.");
    expect(result.annotation).toMatchObject({
      annotationType: "highlight",
      target: { quote: { exact: "beta gamma" } },
      body: "> beta gamma\n\nA useful passage.",
    });
    expect(result.annotation?.document).toEqual(result.source.documents[0]);
    expect(f.read).toHaveBeenCalledWith(
      f.collection.collectionId,
      "[[files/reading.html]]",
      result.source.documents[0]?.revision,
    );
  });
  it("reuses existing sources without overwriting their notes, title or tags", async () => {
    const f = fixture();
    await f.save({ highlight: false });
    const result = await f.save({
      title: "Do not overwrite",
      note: "Do not overwrite",
      tags: "other",
    });
    expect(result.existing).toBe(true);
    expect(result.source.title).toBe(draft.title);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("keeps the source saved but refuses to fabricate a target for missing passages", async () => {
    const f = fixture();
    await expect(
      f.save({}, { ...capture, selection: { exact: "not in the article" } }),
    ).rejects.toThrow("highlight is not");
    expect(f.onSource).toHaveBeenCalledTimes(1);
    expect(f.create).not.toHaveBeenCalled();
  });
  it("refuses a highlight if downloaded bytes do not match the source revision", async () => {
    const f = fixture();
    await f.save({ highlight: false });
    f.read.mockResolvedValue({
      path: "files/reading.html",
      mediaType: "text/html",
      bytes: new TextEncoder().encode("changed"),
    });
    await expect(f.save()).rejects.toThrow("document changed");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("recovers an unknown annotation result without duplicating the record", async () => {
    const f = fixture();
    f.create.mockImplementationOnce((annotation) => {
      f.annotations.set(annotation.id, annotation);
      return Promise.reject(new Error("Outcome unknown"));
    });
    await expect(f.save()).rejects.toThrow("Outcome unknown");
    const result = await f.save();
    expect(result.annotation).not.toBeNull();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.commit).toHaveBeenCalledTimes(1);
  });
});
