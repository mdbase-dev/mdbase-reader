// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes promises and React effects */
import { act, useEffect, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { partSource } from "./source-parts.fixtures.js";
import { useChapterDoi } from "./use-chapter-doi.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { CitationCandidate, Source } from "@mdbase-reader/core";

const book = partSource("Book");
const candidate: CitationCandidate = {
  warnings: [],
  citation: {
    id: "chapter",
    type: "chapter",
    title: "Chapter",
    DOI: "10.1234/chapter",
    ISBN: "9780306406157",
  },
  provenance: {
    provider: "doi.org",
    query: "10.1234/chapter",
    retrievedAt: "2026-01-01T00:00:00Z",
  },
};
const bookCandidate: CitationCandidate = {
  ...candidate,
  citation: book.citation ?? { id: book.id, type: "book" },
};

async function harness(librarySources: readonly Source[] = [book]): Promise<{
  controller: () => ReturnType<typeof useChapterDoi>;
  createSourcePart: ReturnType<typeof vi.fn>;
  createSource: ReturnType<typeof vi.fn>;
  resolveCitation: ReturnType<typeof vi.fn>;
  saveNewSourceCitation: ReturnType<typeof vi.fn>;
  close: () => void;
}> {
  let controller: ReturnType<typeof useChapterDoi>;
  const createSourcePart = vi.fn().mockResolvedValue(partSource("created", "Book"));
  const createSource = vi.fn().mockResolvedValue(book);
  const resolveCitation = vi.fn().mockResolvedValue(bookCandidate);
  const gateway = {
    source: vi.fn().mockResolvedValue(book),
    library: vi.fn().mockResolvedValue({ sources: librarySources }),
    resolveCitation,
    createSourcePart,
  } as unknown as ReaderWorkspaceGateway;
  const workspace = {
    createSource,
    saveNewSourceCitation: vi.fn().mockResolvedValue(book),
    reconcileSource: vi.fn(),
    retryLibrary: vi.fn(),
  } as unknown as ReaderWorkspaceController;
  const host = document.createElement("div");
  const root = createRoot(host);
  function Harness(): JSX.Element {
    const current = useChapterDoi(gateway, workspace, vi.fn());
    useEffect(() => {
      controller = current;
    }, [current]);
    return <div />;
  }
  await act(async () => {
    root.render(<Harness />);
  });
  return {
    controller: () => controller,
    createSourcePart,
    createSource,
    resolveCitation,
    saveNewSourceCitation: workspace.saveNewSourceCitation as ReturnType<typeof vi.fn>,
    close: () => {
      act(() => root.unmount());
    },
  };
}

describe("chapter DOI confirmation", () => {
  it("attaches to the explicitly selected ISBN-matched book, metadata-only, with parent claims", async () => {
    const h = await harness();
    await act(async () => {
      h.controller().propose({ key: "reviewed", candidate, books: [book] });
    });
    expect(h.createSourcePart).not.toHaveBeenCalled();
    await act(async () => {
      await h.controller().confirmChapter(book.id);
    });
    expect(h.createSourcePart).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        parent: book,
        citation: expect.objectContaining({
          type: "chapter",
          DOI: "10.1234/chapter",
          "container-title": "Book",
        }),
      }),
    );
    expect(h.createSourcePart.mock.calls[0]?.[0]).not.toHaveProperty("document");
    h.close();
  });
  it("when unmatched, previews the ISBN lookup and creates a book only after separate confirmation", async () => {
    const h = await harness([]);
    await act(async () => {
      h.controller().propose({ key: "reviewed", candidate, books: [] });
    });
    await act(async () => {
      await h.controller().findChapterBook();
    });
    expect(h.resolveCitation).toHaveBeenCalledExactlyOnceWith(
      { kind: "identifier", value: "isbn:9780306406157" },
      { signal: expect.any(AbortSignal) },
    );
    expect(h.createSource).not.toHaveBeenCalled();
    expect(h.createSourcePart).not.toHaveBeenCalled();
    await act(async () => {
      await h.controller().saveChapterBook();
    });
    expect(h.createSource).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Book", kind: "book", sourceId: expect.any(String) }),
    );
    expect(h.saveNewSourceCitation).toHaveBeenCalledWith(
      book,
      expect.not.objectContaining({ id: expect.anything() }),
      expect.objectContaining({ title: { value: "Book", source: "registry:doi.org" } }),
    );
    expect(h.controller().chapterOffer?.books).toEqual([book]);
    expect(h.createSourcePart).not.toHaveBeenCalled();
    h.close();
  });
  it("requires an explicit ISBN choice when the container lists multiple editions", async () => {
    const h = await harness([]);
    const editions = {
      ...candidate,
      citation: { ...candidate.citation, ISBN: ["9780306406157", "9781861972712"] },
    };
    await act(async () => {
      h.controller().propose({ key: "editions", candidate: editions, books: [] });
    });
    await act(async () => {
      await h.controller().findChapterBook();
    });
    expect(h.resolveCitation).not.toHaveBeenCalled();
    expect(h.controller().error).toContain("Choose");
    h.resolveCitation.mockResolvedValue({
      ...bookCandidate,
      citation: { ...bookCandidate.citation, ISBN: "9781861972712" },
    });
    await act(async () => {
      await h.controller().findChapterBook("9781861972712");
    });
    expect(h.resolveCitation).toHaveBeenCalledExactlyOnceWith(
      { kind: "identifier", value: "isbn:9781861972712" },
      { signal: expect.any(AbortSignal) },
    );
    expect(h.createSource).not.toHaveBeenCalled();
    h.close();
  });

  it("does not create a book for an ISBN identity mismatch", async () => {
    const h = await harness();
    h.resolveCitation.mockResolvedValue({
      ...bookCandidate,
      citation: { id: "other", type: "book", ISBN: "9781861972712" },
    });
    await act(async () => {
      h.controller().propose({ key: "reviewed", candidate, books: [] });
    });
    await act(async () => {
      await h.controller().findChapterBook();
    });
    expect(h.controller().error).toContain("did not match");
    expect(h.createSource).not.toHaveBeenCalled();
    h.close();
  });
});

it("cancels a container ISBN lookup immediately and ignores its late result", async () => {
  const h = await harness([]);
  let resolve!: (candidate: CitationCandidate) => void;
  h.resolveCitation.mockReturnValueOnce(
    new Promise<CitationCandidate>((done) => {
      resolve = done;
    }),
  );
  await act(async () => h.controller().propose({ key: "reviewed", candidate, books: [] }));
  let lookup!: Promise<void>;
  await act(async () => {
    lookup = h.controller().findChapterBook();
  });
  const signal = h.resolveCitation.mock.calls[0]?.[1].signal as AbortSignal;
  expect(h.controller().canCancel).toBe(true);
  await act(async () => h.controller().cancel());
  expect(signal.aborted).toBe(true);
  expect(h.controller().busy).toBe(false);
  await act(async () => {
    resolve(bookCandidate);
    await lookup;
  });
  expect(h.controller().bookOffer).toBeNull();
  expect(h.controller().error).toBeNull();
  expect(h.createSource).not.toHaveBeenCalled();
  h.close();
});
