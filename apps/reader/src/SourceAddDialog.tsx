import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useRef, useState, type JSX } from "react";

import { chapterIsbns } from "./chapter-doi.js";
import { CloseIcon, FileIcon } from "./icons.js";
import { chapterCitation } from "./source-part-creation.js";
import { citationText } from "./use-chapter-doi.js";

import type { SourceAdditionController } from "./use-source-addition.js";

export function SourceAddDialog({
  open,
  busy,
  error,
  canChooseFile,
  onClose,
  onChooseFile,
  onCapture,
  onEdit,
  onDropFile,
  lookup,
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly canChooseFile: boolean;
  readonly onClose: () => void;
  readonly onChooseFile: () => void;
  readonly onCapture: (url: string) => void;
  readonly onEdit: () => void;
  readonly onDropFile: (file: File) => void;
  readonly lookup: SourceAdditionController["lookup"];
}): JSX.Element | null {
  return open ? (
    <OpenSourceAddDialog
      busy={busy}
      error={error}
      canChooseFile={canChooseFile}
      onClose={onClose}
      onChooseFile={onChooseFile}
      onCapture={onCapture}
      onEdit={onEdit}
      onDropFile={onDropFile}
      lookup={lookup}
    />
  ) : null;
}

function OpenSourceAddDialog({
  busy,
  error,
  canChooseFile,
  onClose,
  onChooseFile,
  onCapture,
  onEdit,
  onDropFile,
  lookup,
}: Omit<Parameters<typeof SourceAddDialog>[0], "open">): JSX.Element {
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [busy, onClose]);
  return (
    <div
      className="import-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <section
        className="import-dialog source-add-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-add-source-title"
      >
        <button
          className="icon-button source-add-close"
          type="button"
          aria-label="Close add source"
          disabled={busy}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <div className="import-dialog-heading">
          <h2 id="reader-add-source-title">Add a source</h2>
          <p>
            Save a web page or PDF link, look up a work by DOI, arXiv ID or ISBN, or add a file from
            your device.
          </p>
        </div>
        <form
          className="capture-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim() && !busy) {
              onCapture(url.trim());
            }
          }}
        >
          <label className="capture-url-field">
            <span>Link or identifier</span>
            <span className="capture-url-row">
              <input
                className="mdbase-field"
                ref={input}
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                placeholder="https://…, DOI, arXiv ID or ISBN"
                value={url}
                disabled={busy}
                onChange={(event) => {
                  setUrl(event.target.value);
                  onEdit();
                }}
              />
              <ReaderButton disabled={busy || !url.trim()}>{busy ? "Adding…" : "Add"}</ReaderButton>
            </span>
          </label>
          {busy && lookup.progress ? (
            <p className="capture-progress" role="status">
              {lookup.progress}
            </p>
          ) : null}
          {error ? (
            <p className="import-error capture-error" role="alert">
              {error}
            </p>
          ) : null}
          <LookupFollowUp busy={busy} lookup={lookup} />
        </form>
        <div className="source-add-divider">
          <span>or</span>
        </div>
        <FileChoice disabled={busy || !canChooseFile} onChoose={onChooseFile} onDrop={onDropFile} />
      </section>
    </div>
  );
}

/** After a lookup: offer to keep just the citation, or say what went wrong before opening. */
function LookupFollowUp({
  busy,
  lookup,
}: {
  readonly busy: boolean;
  readonly lookup: SourceAdditionController["lookup"];
}): JSX.Element | null {
  if (lookup.chapterOffer) {
    return <ChapterDoiReview busy={busy} lookup={lookup} />;
  }
  if (lookup.notice) {
    return (
      <div className="capture-follow-up" role="status">
        <p>Added. {lookup.notice.message}</p>
        <ReaderButton onClick={lookup.openNoticed}>Open source</ReaderButton>
      </div>
    );
  }
  if (lookup.offer) {
    return (
      <div className="capture-follow-up">
        <p>
          Reader couldn’t fetch that page ({lookup.offer.reason}), but it found the citation for “
          {lookup.offer.title}”. You can save the citation now and attach the page or file later.
        </p>
        <button
          className="connection-secondary"
          type="button"
          disabled={busy}
          onClick={() => void lookup.saveCitationOnly()}
        >
          Save citation only
        </button>
      </div>
    );
  }
  return null;
}

function ChapterDoiReview({
  busy,
  lookup,
}: {
  readonly busy: boolean;
  readonly lookup: SourceAdditionController["lookup"];
}): JSX.Element | null {
  const [book, setBook] = useState("");
  const [isbn, setIsbn] = useState("");
  const offer = lookup.chapterOffer;
  const isbns = chapterIsbns(offer?.candidate.citation["ISBN"]);
  if (!offer) {
    return null;
  }
  return (
    <div className="capture-follow-up">
      <p>
        Chapter: {citationText(offer.candidate.citation, "title", "Untitled chapter")}. Create a
        metadata-only chapter with its own DOI and citation; no PDF page range is inferred.
      </p>
      <details>
        <summary>Review chapter citation</summary>
        <pre>{JSON.stringify(offer.candidate.citation, null, 2)}</pre>
      </details>
      {offer.books.length ? (
        <>
          <label>
            Attach to the matching book
            <select value={book} disabled={busy} onChange={(event) => setBook(event.target.value)}>
              <option value="">Choose the correct book edition</option>
              {offer.books.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title} · {citationText(source.citation ?? {}, "ISBN")} · {source.path}
                </option>
              ))}
            </select>
          </label>
          {offer.books
            .filter(({ id }) => id === book)
            .map((source) => (
              <details key={source.id}>
                <summary>Preview citation with From the book details</summary>
                <pre>
                  {JSON.stringify(
                    chapterCitation(
                      { ...(source.citation ? { citation: source.citation } : {}) },
                      citationText(offer.candidate.citation, "title", "Untitled chapter"),
                      Object.entries(offer.candidate.citation)
                        .filter(([field]) => field !== "id")
                        .map(([field, value]) => ({
                          field,
                          value,
                          source: { kind: "registry", name: "doi.org" },
                          observedAt: offer.candidate.provenance.retrievedAt,
                        })),
                    ).citation,
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))}
          <button
            type="button"
            disabled={busy || !offer.books.some(({ id }) => id === book)}
            onClick={() => {
              const source = offer.books.find(({ id }) => id === book);
              if (source) {
                void lookup.confirmChapter(source.id);
              }
            }}
          >
            Confirm and create chapter
          </button>
        </>
      ) : lookup.bookOffer ? (
        <>
          <p>
            Create the book first:{" "}
            {citationText(lookup.bookOffer.citation, "title", "Untitled book")}
          </p>
          <pre>{JSON.stringify(lookup.bookOffer.citation, null, 2)}</pre>
          <button type="button" disabled={busy} onClick={() => void lookup.saveChapterBook()}>
            Confirm and create book first
          </button>
        </>
      ) : (
        <>
          <p>
            No matching book is indexed. Look up the container ISBN to review a book before creating
            the chapter.
          </p>
          {isbns.length > 1 ? (
            <label>
              Container ISBN / edition
              <select value={isbn} onChange={(event) => setIsbn(event.target.value)}>
                <option value="">Choose the correct edition</option>
                {isbns.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            disabled={busy || (isbns.length > 1 && !isbn)}
            onClick={() => void lookup.findChapterBook(isbn || undefined)}
          >
            Find book by container ISBN…
          </button>
        </>
      )}
    </div>
  );
}

function FileChoice({
  disabled,
  onChoose,
  onDrop,
}: {
  readonly disabled: boolean;
  readonly onChoose: () => void;
  readonly onDrop: (file: File) => void;
}): JSX.Element {
  const [dragging, setDragging] = useState(false);
  return (
    <button
      className={`source-file-choice${dragging ? " is-dragging" : ""}`}
      type="button"
      disabled={disabled}
      onClick={onChoose}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        const file = event.dataTransfer.files[0];
        setDragging(false);
        if (file) {
          event.preventDefault();
          onDrop(file);
        }
      }}
    >
      <FileIcon />
      <span>
        <strong>{dragging ? "Drop to add" : "Choose or drop a file"}</strong>
        <small>PDF, EPUB or saved web page</small>
      </span>
    </button>
  );
}
