import {
  collectionId,
  fileId,
  fileRevision,
  recordRevision,
  type Annotation,
  type PlannedSourceFileImport,
  type Source,
  type SourceSummary,
} from "@mdbase-reader/core";
import { vi } from "vitest";

import {
  CaptureWriter,
  type CaptureDraft,
  type SaveCaptureInput,
  type SavedCapture,
} from "../save-capture.js";

import type { PageCapture, SelectedWebCapture } from "../page-capture.js";
import type {
  ReaderConnectedCollection,
  ReaderPortableApplicationSession,
} from "@mdbase-reader/connect";

export const capture: SelectedWebCapture = {
  kind: "html",
  submittedUrl: "https://example.com/article",
  canonicalUrl: "https://example.com/article",
  retrievedAt: "2026-09-23T12:00:00.000Z",
  pageTitle: "[test] Article",
  html: "<!doctype html><html><head><title>[test] Article</title></head><body><article><p>Alpha beta <em>gamma delta</em> epsilon zeta.</p></article></body></html>",
  selection: { exact: "beta gamma", prefix: "Alpha ", suffix: " delta" },
};
export const draft: CaptureDraft = {
  title: "[test] Edited title",
  tags: "research, test, research",
  note: "Keep **this note**.",
  comment: "A useful passage.",
  highlight: true,
  color: "green",
  highlightTags: "method, method, key",
};

// The fixture intentionally exposes inferred Vitest mock signatures for assertions.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function fixture() {
  let source: Source | null = null;
  let bytes = new Uint8Array();
  const annotations = new Map<string, Annotation>();
  const saved = (): Source => {
    if (!source) {
      throw new Error("No source has been committed.");
    }
    return source;
  };
  const commit = vi.fn((plan: PlannedSourceFileImport) => {
    const primary = plan.representations[0];
    if (!primary) {
      throw new Error("The plan has no primary representation.");
    }
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
  const updateCitation = vi.fn((input: { citation: Record<string, unknown> }): Promise<Source> => {
    source = { ...saved(), citation: input.citation as Source["citation"] & object };
    return Promise.resolve(source);
  });
  const updateFields = vi.fn((input: { fields: Record<string, unknown> }) => {
    source = { ...saved(), url: input.fields["url"] as string };
    return Promise.resolve(source);
  });
  const findByCitekeyPrefix = vi.fn(() => Promise.resolve<SourceSummary[]>([]));
  const collection = {
    collectionId: collectionId("[test] library"),
    sources: {
      list: vi.fn(() => Promise.resolve({ items: source ? [source] : [] })),
      get: vi.fn(() => Promise.resolve(source)),
      updateCitation,
      updateFields,
      findByCitekeyPrefix,
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
  const journal = new Map<string, string>();
  const writer = new CaptureWriter({
    get: (key) => Promise.resolve(journal.get(key) ?? null),
    set: (key, value) => Promise.resolve(void journal.set(key, value)),
    remove: (key) => Promise.resolve(void journal.delete(key)),
  });
  const save = (
    changes: Partial<CaptureDraft> = {},
    page: PageCapture = capture,
    extra: Partial<SaveCaptureInput> = {},
  ): Promise<SavedCapture> =>
    writer.save({
      session,
      collection,
      capture: page,
      draft: { ...draft, ...changes },
      onSource,
      onProgress: vi.fn(),
      ...extra,
    });
  return {
    save,
    collection,
    session,
    commit,
    create,
    read,
    onSource,
    annotations,
    updateCitation,
    updateFields,
    findByCitekeyPrefix,
  };
}
