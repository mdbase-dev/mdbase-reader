import { annotationFromDocument, sourceFromDocument } from "@mdbase-reader/connect";
import { createTestApp } from "@mdbase-reader/connect/testing";
import { collectionId } from "@mdbase-reader/core";
import { vi } from "vitest";

import type { DraftStorage } from "./source-draft-storage.js";
import type { TestApp } from "@mdbase-reader/connect/testing";
import type { Annotation, Source } from "@mdbase-reader/core";

export function draftStorage(): DraftStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

export async function editorFixture(): Promise<{
  app: TestApp;
  source: Source;
  annotation: Annotation;
  close(): Promise<void>;
}> {
  const app = await createTestApp({
    collections: [
      {
        name: "Reading",
        records: [
          {
            path: "sources/book.md",
            types: ["reader-source"],
            frontmatter: { id: "book", title: "Book" },
            body: "Original source",
          },
          {
            path: "annotations/note.md",
            types: ["reader-annotation"],
            frontmatter: {
              id: "note",
              source: "book",
              annotation_type: "note",
              created_at: "2026-08-01T00:00:00Z",
            },
            body: "Original annotation",
          },
        ],
      },
    ],
  });
  const client = app.client();
  // Pending/recovery fixtures use the SDK's normal timeout option without waiting thirty seconds.
  const awaitReceipt = client.awaitReceipt.bind(client);
  vi.spyOn(client, "awaitReceipt").mockImplementation((id, options) =>
    awaitReceipt(id, { ...options, timeoutMs: 40 }),
  );
  const include = { effective: true, body: true, document: true };
  const collection = collectionId(client.collection);
  const source = sourceFromDocument(
    collection,
    await client.get({ path: "sources/book.md" }, { include }),
  );
  const annotation = annotationFromDocument(
    collection,
    await client.get({ path: "annotations/note.md" }, { include }),
    source.id,
  );
  return { app, source, annotation, close: () => app.close() };
}
