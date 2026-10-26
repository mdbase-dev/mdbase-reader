import { describe, expect, it, vi } from "vitest";

import { readerCommands, type ReaderCommandInput } from "./reader-command-list.js";
import { partSource } from "./source-parts.fixtures.js";

import type { SourceSummary } from "@mdbase-reader/core";

const book = partSource("book");
function input(
  activeSource: SourceSummary | null,
  createSourceParts: ReaderCommandInput["createSourceParts"],
  sources: readonly SourceSummary[] = [book],
): ReaderCommandInput {
  return {
    activeSource,
    createSourceParts,
    sources,
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

  it("hides the current-source command without a current source or without a PDF/EPUB", () => {
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

  it("offers each library book when no current PDF/EPUB is focused, findable by “chap”", () => {
    const chapter = partSource("chapter", "book");
    const web = {
      ...partSource("web"),
      documents: book.documents.map((document) => ({ ...document, mediaType: "text/html" })),
    };
    const create = vi.fn();
    for (const active of [null, web]) {
      const commands = readerCommands(input(active, create, [book, chapter, web])).filter(
        ({ id }) => id.startsWith("add-chapters-as-sources"),
      );
      expect(commands.map(({ id }) => id)).toEqual(["add-chapters-as-sources:book"]);
      expect(commands[0]).toMatchObject({
        label: "Add chapters as sources… — book",
        group: "Sources",
      });
      expect(commands[0]!.label.toLocaleLowerCase()).toContain("chap");
      commands[0]!.run();
      expect(create).toHaveBeenLastCalledWith(book);
    }
    expect(
      readerCommands(input(book, create, [book, chapter])).filter(({ id }) =>
        id.startsWith("add-chapters-as-sources"),
      ),
    ).toHaveLength(1);
    expect(
      readerCommands(input(null, null, [book])).some(({ id }) =>
        id.startsWith("add-chapters-as-sources"),
      ),
    ).toBe(false);
  });
});
