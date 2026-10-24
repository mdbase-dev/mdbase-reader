import {
  cslValuesEqual,
  sourceId,
  type CitationCandidate,
  type Source,
  type SourceId,
} from "@mdbase-reader/core";
import { useCallback, useRef, useState } from "react";

import {
  chapterBooks,
  chapterCandidateClaims,
  chapterIsbns,
  type ChapterDoiOffer,
} from "./chapter-doi.js";
import { readerErrorMessage } from "./errors.js";
import { newCitationProvenance } from "./new-citation-provenance.js";
import { chapterPlan, confirmChapterPlans } from "./source-part-creation.js";
import { useCaptureTask } from "./use-capture-task.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

export function citationText(
  citation: Readonly<Record<string, unknown>>,
  field: string,
  fallback = "",
): string {
  return typeof citation[field] === "string" ? citation[field] : fallback;
}

interface ChapterDoiController {
  readonly chapterOffer: ChapterDoiOffer | null;
  readonly bookOffer: CitationCandidate | null;
  readonly busy: boolean;
  readonly canCancel: boolean;
  readonly cancel: () => void;
  readonly error: string | null;
  readonly propose: (offer: ChapterDoiOffer | null) => void;
  readonly confirmChapter: (id: SourceId) => Promise<void>;
  readonly findChapterBook: (isbn?: string) => Promise<void>;
  readonly saveChapterBook: () => Promise<void>;
}

async function reviewedChapterParent(
  gateway: ReaderWorkspaceGateway,
  offer: ChapterDoiOffer,
  bookId: SourceId,
): Promise<Source> {
  const parent = await (gateway.refreshSource ?? gateway.source).call(gateway, bookId);
  const preview = offer.books.find(({ id }) => id === bookId);
  if (!parent || !cslValuesEqual(parent.citation, preview?.citation)) {
    throw new Error(
      "The book citation changed. Look up the chapter DOI again to review the new container details.",
    );
  }
  return parent;
}

async function lookupChapterBook(
  gateway: ReaderWorkspaceGateway | undefined,
  offer: ChapterDoiOffer | null,
  selectedIsbn: string | undefined,
  signal: AbortSignal,
): Promise<CitationCandidate> {
  const isbns = chapterIsbns(offer?.candidate.citation["ISBN"]);
  const isbn =
    selectedIsbn && isbns.includes(selectedIsbn)
      ? selectedIsbn
      : isbns.length === 1
        ? isbns[0]
        : undefined;
  if (!isbn || !gateway?.resolveCitation) {
    throw new Error(
      "Choose the correct container ISBN, or add the book by ISBN first and retry the chapter DOI.",
    );
  }
  const candidate = await gateway.resolveCitation(
    { kind: "identifier", value: `isbn:${isbn}` },
    { signal },
  );
  signal.throwIfAborted();
  if (
    candidate.citation.type !== "book" ||
    !chapterIsbns(candidate.citation["ISBN"]).includes(isbn)
  ) {
    throw new Error("The catalogue result did not match the container ISBN. No book was created.");
  }
  return candidate;
}

function useChapterBookLookup(
  gateway: ReaderWorkspaceGateway | undefined,
  offer: ChapterDoiOffer | null,
  onError: (message: string | null) => void,
  onFound: (candidate: CitationCandidate) => void,
): {
  busy: boolean;
  canCancel: boolean;
  cancel: () => void;
  find: (isbn?: string) => Promise<void>;
} {
  const task = useCaptureTask();
  return {
    busy: task.status === "capturing",
    canCancel: task.canCancel,
    cancel: task.cancel,
    find: async (isbn) => {
      const operation = task.begin();
      if (!operation) {
        return;
      }
      onError(null);
      try {
        const candidate = await lookupChapterBook(gateway, offer, isbn, operation.signal);
        onFound(candidate);
      } catch (reason) {
        if (operation.isCurrent()) {
          onError(readerErrorMessage(reason, "Could not find this book."));
        }
      } finally {
        operation.finish();
      }
    },
  };
}

export function useChapterDoi(
  gateway: ReaderWorkspaceGateway | undefined,
  workspace: ReaderWorkspaceController,
  onImported: (id: SourceId) => void,
): ChapterDoiController {
  const [offer, setOffer] = useState<ChapterDoiOffer | null>(null);
  const [bookOffer, setBookOffer] = useState<CitationCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bookIdentity = useRef<SourceId | null>(null);
  const pending = useRef(false);
  const lookup = useChapterBookLookup(gateway, offer, setError, (candidate) => {
    bookIdentity.current = sourceId(`src_${crypto.randomUUID()}`);
    setBookOffer(candidate);
  });
  const propose = useCallback((value: ChapterDoiOffer | null): void => {
    setOffer(value);
    setBookOffer(null);
    bookIdentity.current = null;
    setError(null);
  }, []);
  const run = async (work: () => Promise<void>): Promise<void> => {
    if (pending.current || lookup.busy) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (reason) {
      setError(readerErrorMessage(reason, "Could not create this chapter."));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return {
    chapterOffer: offer,
    bookOffer,
    busy: busy || lookup.busy,
    canCancel: lookup.canCancel,
    cancel: lookup.cancel,
    error,
    propose,
    confirmChapter: (bookId: SourceId) =>
      run(async () => {
        if (!offer || !gateway || !offer.books.some(({ id }) => id === bookId)) {
          return;
        }
        const parent = await reviewedChapterParent(gateway, offer, bookId);
        const plan = chapterPlan(
          parent,
          {
            key: offer.key,
            title: citationText(offer.candidate.citation, "title", "Untitled chapter"),
            level: 0,
          },
          undefined,
          chapterCandidateClaims(offer.candidate),
        );
        await confirmChapterPlans(gateway, [plan], false, workspace.reconcileSource);
        workspace.retryLibrary();
        propose(null);
        onImported(plan.sourceId);
      }),
    findChapterBook: lookup.find,
    saveChapterBook: () =>
      run(async () => {
        if (!bookOffer || !offer || !workspace.createSource || !bookIdentity.current || !gateway) {
          return;
        }
        const library = await gateway.library();
        if (library.sourceIndex?.complete === false) {
          throw new Error("The book index is partial. Finish loading before creating a book.");
        }
        const matches = chapterBooks(bookOffer, library.sources);
        if (matches.length) {
          setOffer({ ...offer, books: matches });
          setBookOffer(null);
          return;
        }
        const created = await workspace.createSource({
          sourceId: bookIdentity.current,
          title: citationText(bookOffer.citation, "title", "Untitled book"),
          kind: "book",
        });
        if (!created) {
          return;
        }
        const parent = await (gateway.refreshSource ?? gateway.source).call(
          gateway,
          bookIdentity.current,
        );
        if (!parent || !workspace.saveNewSourceCitation) {
          throw new Error(
            "The book record was created but citation saving is unavailable. Repair its citation before retrying the chapter.",
          );
        }
        const citation = Object.fromEntries(
          Object.entries(bookOffer.citation).filter(([key]) => key !== "id"),
        );
        const provenance = await newCitationProvenance(bookOffer, gateway);
        const book = await workspace.saveNewSourceCitation(parent, citation, provenance);
        workspace.reconcileSource(book);
        setOffer({ ...offer, books: [book] });
        setBookOffer(null);
      }),
  };
}
