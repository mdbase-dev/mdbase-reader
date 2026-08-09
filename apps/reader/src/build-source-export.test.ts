import {
  annotationId,
  collectionId,
  dateTime,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type Annotation,
  type Source,
} from "@mdbase-reader/core";
import { BlobReader, TextWriter, Uint8ArrayWriter, ZipReader, type Entry } from "@zip.js/zip.js";
import { describe, expect, it, vi } from "vitest";

import { buildSourceExport } from "./build-source-export.js";

const pdfRevision = fileRevision(`sha256:${"a".repeat(64)}`);

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_01"),
  path: "sources/example.md",
  title: "An Example / Reader",
  creators: [],
  tags: [],
  documents: [
    {
      fileId: fileId("file-01"),
      file: "[[files/example.pdf]]",
      revision: pdfRevision,
      mediaType: "application/pdf",
      role: "primary",
    },
  ],
  citation: { id: "example2026", type: "article", title: "Example" },
  body: "# Notes\n\n![[annotations/ann_01]]",
  recordRevision: recordRevision("record-rev"),
  frontmatter: { type: "reader-source", id: "src_01", custom: { retained: true } },
};

const annotation: Annotation = {
  collectionId: source.collectionId,
  id: annotationId("ann_01"),
  path: "annotations/ann_01.md",
  frontmatter: {
    type: "reader-annotation",
    id: "ann_01",
    source: "[[src_01]]",
    annotation_type: "highlight",
    created_at: "2026-08-09T00:00:00Z",
    extension_field: "preserved",
  },
  sourceId: source.id,
  source: "[[src_01]]",
  document: {
    fileId: fileId("file-01"),
    file: "[[files/example.pdf]]",
    revision: pdfRevision,
  },
  annotationType: "highlight",
  locator: { label: "p. 2" },
  target: { quote: { exact: "Durable quotation" } },
  tags: [],
  body: "> Durable quotation",
  createdAt: dateTime("2026-08-09T00:00:00Z"),
};

describe("buildSourceExport", () => {
  it("packages canonical records, materialized Markdown, CSL, and exact originals", async () => {
    const readFile = vi.fn().mockResolvedValue({
      path: "files/example.pdf",
      mediaType: "application/pdf",
      bytes: new Uint8Array([37, 80, 68, 70]),
    });
    const result = await buildSourceExport({
      source,
      annotations: [annotation],
      citationSources: [source],
      readFile,
    });
    const entries = await zipEntries(result.blob);

    expect(result.fileName).toBe("an-example-reader-reader-export.zip");
    expect([...entries.keys()]).toEqual([
      "canonical/sources/example.md",
      "canonical/annotations/ann_01.md",
      "materialized/example.md",
      "materialized/references.json",
      "originals/files/example.pdf",
    ]);
    expect(await entryText(entries.get("canonical/sources/example.md"))).toContain(
      "custom:\n  retained: true",
    );
    expect(await entryText(entries.get("canonical/annotations/ann_01.md"))).toContain(
      "extension_field: preserved",
    );
    expect(await entryText(entries.get("materialized/example.md"))).toContain(
      "> — [@example2026, p. 2]",
    );
    expect(JSON.parse(await entryText(entries.get("materialized/references.json")))).toEqual([
      source.citation,
    ]);
    expect(await entryBytes(entries.get("originals/files/example.pdf"))).toEqual(
      new Uint8Array([37, 80, 68, 70]),
    );
    expect(readFile).toHaveBeenCalledWith("[[files/example.pdf]]", pdfRevision);
  });

  it("keeps a usable export and writes a visible report when an original is unavailable", async () => {
    const result = await buildSourceExport({
      source,
      annotations: [annotation],
      citationSources: [source],
      readFile: () => Promise.reject(new Error("file_not_found")),
    });
    const entries = await zipEntries(result.blob);

    expect(result.fileProblems).toEqual([{ path: "files/example.pdf", message: "file_not_found" }]);
    expect(await entryText(entries.get("EXPORT-REPORT.md"))).toContain(
      "files/example.pdf: file_not_found",
    );
    expect(entries.has("canonical/sources/example.md")).toBe(true);
  });
});

async function zipEntries(blob: Blob): Promise<Map<string, Entry>> {
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();
  await reader.close();
  return new Map(entries.map((entry) => [entry.filename, entry]));
}

async function entryText(entry: Entry | undefined): Promise<string> {
  if (!entry || !("getData" in entry)) {
    throw new Error("Missing zip entry");
  }
  return entry.getData(new TextWriter());
}

async function entryBytes(entry: Entry | undefined): Promise<Uint8Array> {
  if (!entry || !("getData" in entry)) {
    throw new Error("Missing zip entry");
  }
  return entry.getData(new Uint8ArrayWriter());
}
