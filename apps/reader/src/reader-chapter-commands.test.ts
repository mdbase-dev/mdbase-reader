import { describe, expect, it, vi } from "vitest";

import { readerCommands, type ReaderCommandInput } from "./reader-command-list.js";
import { partSource } from "./source-parts.fixtures.js";

import type { SourceSummary } from "@mdbase-reader/core";

const book = partSource("book");
function input(
  activeSource: SourceSummary | null,
  createSourceParts: ReaderCommandInput["createSourceParts"],
): ReaderCommandInput {
  return {
    activeSource,
    createSourceParts,
    sources: [book],
    workspace: {
      layout: { panes: [{ id: "primary", tabs: [] }], focusedPaneId: "primary" },
      openSourceIds: [],
      activeTab: null,
    },
    sourceExport: { run: vi.fn() },
    bibliographyExport: { run: vi.fn() },
    theme: "light",
    density: "comfortable",
  } as unknown as ReaderCommandInput;
}

const chapterCommand = (
  value: ReaderCommandInput,
): ReturnType<typeof readerCommands>[number] | undefined =>
  readerCommands(value).find(({ id }) => id === "add-chapters-as-sources");

describe("current-source chapter command", () => {
  it.each(["application/pdf", "application/epub+zip"])(
    "opens chapter creation for the current %s source",
    (mediaType) => {
      const current = {
        ...book,
        documents: book.documents.map((document) => ({ ...document, mediaType })),
      };
      const create = vi.fn();
      const command = chapterCommand(input(current, create));
      expect(command).toMatchObject({
        label: "Add chapters as sources…",
        group: "Current source",
        detail: "book",
      });
      expect(create).not.toHaveBeenCalled();
      command?.run();
      expect(create).toHaveBeenCalledExactlyOnceWith(current);
    },
  );

  it("hides the command when the rollout gate or gateway makes the creation context unavailable", () => {
    expect(chapterCommand(input(book, null))).toBeUndefined();
    expect(chapterCommand(input(book, undefined))).toBeUndefined();
  });

  it("hides the command without a current source or without a PDF/EPUB", () => {
    expect(chapterCommand(input(null, vi.fn()))).toBeUndefined();
    expect(chapterCommand(input({ ...book, documents: [] }, vi.fn()))).toBeUndefined();
    expect(
      chapterCommand(
        input(
          {
            ...book,
            documents: book.documents.map((document) => ({ ...document, mediaType: "text/html" })),
          },
          vi.fn(),
        ),
      ),
    ).toBeUndefined();
  });
});
