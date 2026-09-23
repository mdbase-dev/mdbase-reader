import { hash } from "../model.js";

export async function fixture(): Promise<Map<string, Blob>> {
  const pdf = new Blob(["%PDF-test-bytes"]);
  const path = "files/ATT/document.pdf";
  const datasets = {
    items: [
      {
        key: "SOURCE",
        zotero: {
          key: "SOURCE",
          itemType: "book",
          title: "Test library",
          collections: ["COLL"],
          dateAdded: "2026-01-01T00:00:00Z",
          tags: [],
        },
        csl: { id: 42, type: "book", title: "Test library" },
      },
    ],
    notes: [
      {
        key: "NOTE",
        zotero: { key: "NOTE", parentItem: "SOURCE", note: "<p>Private note</p>", tags: [] },
      },
    ],
    annotations: [
      {
        key: "ANN",
        zotero: {
          key: "ANN",
          parentItem: "ATT",
          annotationType: "highlight",
          annotationText: "Exact quotation",
          annotationComment: "Comment",
          annotationPosition: '{"pageIndex":0,"rects":[[1,2,3,4]]}',
        },
      },
    ],
    attachments: [
      {
        key: "ATT",
        zotero: {
          key: "ATT",
          parentItem: "SOURCE",
          contentType: "application/pdf",
          title: "Original PDF",
        },
        status: "available",
        path,
        files: [path],
      },
    ],
    collections: [{ key: "COLL", zotero: { key: "COLL", name: "Reading" } }],
  };
  const files = new Map<string, Blob>([[path, pdf]]);
  for (const [name, value] of Object.entries(datasets)) {
    files.set(`${name}.json`, new Blob([JSON.stringify(value)]));
  }
  files.set(
    "manifest.json",
    new Blob([
      JSON.stringify({
        format: "dev.mdbase.reader.zotero-bundle",
        version: 1,
        status: "complete",
        source: { library: "user:fixture" },
        startedAt: "2026-01-01T00:00:00Z",
        counts: {
          items: 1,
          notes: 1,
          annotations: 1,
          attachments: 1,
          collections: 1,
          files: 1,
          availableAttachments: 1,
          missingAttachments: 0,
        },
        warnings: [],
        files: [{ path, bytes: pdf.size, sha256: await hash(pdf) }],
      }),
    ]),
  );
  return files;
}
