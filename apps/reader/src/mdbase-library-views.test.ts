import { describe, expect, it } from "vitest";

import {
  applyLibraryViewConfiguration,
  buildLibraryView,
  defaultLibraryViewConfiguration,
  libraryViewConfiguration,
} from "./mdbase-library-views.js";

import type { SourceSummary } from "@mdbase-reader/core";

describe("mdbase library views", () => {
  it("describes Reader configuration as an ordinary canonical mdbase view", () => {
    const frontmatter = buildLibraryView({
      name: "Reading queue",
      configuration: {
        ...defaultLibraryViewConfiguration,
        presentation: "cards",
        sortField: "published",
        sortDirection: "desc",
        filter: {
          query: "attention",
          status: "reading",
          format: "pdf",
          tag: "study",
          conditions: [],
        },
      },
    });
    expect(frontmatter).toMatchObject({
      type: "view",
      id: "reader.library.reading-queue",
      version: 1,
      query: { types: ["reader-source"] },
      views: [
        {
          id: "reading-queue",
          name: "Reading queue",
          where:
            'reading.status == "reading" && documents.exists(document, document.media_type.contains("pdf")) && tags.contains("study")',
          presentation: {
            type: "cards",
            fallback: "table",
            options: { readerViewVersion: 1 },
          },
        },
      ],
    });
  });

  it("round-trips Reader presentation options", () => {
    const configuration = libraryViewConfiguration({
      type: "cards",
      options: {
        columns: ["title", "creator", "tags"],
        sortField: "creator",
        sortDirection: "asc",
        filter: {
          query: "weil",
          status: "reading",
          format: "pdf",
          tag: "attention",
          conditions: [],
        },
      },
    });
    expect(configuration).toEqual({
      presentation: "cards",
      columns: ["title", "creator", "tags"],
      columnWidths: {},
      sortField: "creator",
      sortDirection: "asc",
      filter: { query: "weil", status: "reading", format: "pdf", tag: "attention", conditions: [] },
    });
  });

  it("filters and sorts normalized Reader sources for immediate view editing", () => {
    const visible = applyLibraryViewConfiguration(
      [
        source("two", "Zebra", "queued", ["design"]),
        source("one", "Attention", "reading", ["study"]),
      ],
      {
        ...defaultLibraryViewConfiguration,
        filter: {
          query: "attention",
          status: "reading",
          format: "pdf",
          tag: "study",
          conditions: [],
        },
      },
    );
    expect(visible.map(({ title }) => title)).toEqual(["Attention"]);
  });
});

function source(
  id: string,
  title: string,
  readingStatus: NonNullable<SourceSummary["readingStatus"]>,
  tags: readonly string[],
): SourceSummary {
  return {
    collectionId: "collection" as SourceSummary["collectionId"],
    id: id as SourceSummary["id"],
    path: `sources/${id}.md`,
    title,
    creators: ["Author"],
    tags,
    readingStatus,
    documents: [
      {
        fileId: `file-${id}` as SourceSummary["documents"][number]["fileId"],
        file: `[[files/${id}.pdf]]`,
        revision: `sha256:${"a".repeat(64)}` as SourceSummary["documents"][number]["revision"],
        mediaType: "application/pdf",
        role: "primary",
      },
    ],
  };
}
