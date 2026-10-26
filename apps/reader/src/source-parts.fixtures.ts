import {
  collectionId,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type Source,
} from "@mdbase-reader/core";

export function partSource(id: string, partOf?: string): Source {
  const citation = {
    id,
    type: partOf ? "chapter" : "book",
    title: id,
    ...(partOf ? {} : { ISBN: "9780306406157", publisher: "Book press" }),
  };
  return {
    collectionId: collectionId("parts"),
    id: sourceId(id),
    path: `sources/${id}.md`,
    title: id,
    creators: [],
    tags: [],
    body: "",
    recordRevision: recordRevision(`rev-${id}`),
    ...(partOf ? { partOf: sourceId(partOf) } : {}),
    citation,
    frontmatter: { csl: citation },
    documents: [
      {
        fileId: fileId("book-file"),
        file: "[[files/book.pdf]]",
        revision: fileRevision(`sha256:${"a".repeat(64)}`),
        mediaType: "application/pdf",
        role: "primary",
      },
    ],
  };
}
