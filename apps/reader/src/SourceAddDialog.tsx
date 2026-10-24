import { ReaderButton } from "@mdbase-reader/ui";
import { useRef, useState, type JSX } from "react";

import { chapterIsbns } from "./chapter-doi.js";
import { citationDateText, citationNames, displayCslValue } from "./citation-form-model.js";
import { CloseIcon, FileIcon } from "./icons.js";
import { ModalDialog } from "./ModalDialog.js";
import { chapterCitation } from "./source-part-creation.js";
import { citationText } from "./use-chapter-doi.js";

import type { SourceAdditionController } from "./use-source-addition.js";
import type { SourceSummary } from "@mdbase-reader/core";

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

  return (
    <ModalDialog
      className="import-dialog source-add-dialog"
      labelledBy="reader-add-source-title"
      initialFocus={input}
      onDismiss={() => {
        if (!busy && !url.trim()) {
          onClose();
        }
      }}
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
        {busy ? (
          <button
            className="connection-secondary"
            type="button"
            disabled={!lookup.canCancel}
            onClick={lookup.cancel}
          >
            {lookup.canCancel ? "Cancel" : "Finishing…"}
          </button>
        ) : null}
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
    </ModalDialog>
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
        <p>{lookup.notice.message}</p>
        <ProblemDetails detail={lookup.notice.detail} />
        <ReaderButton onClick={lookup.openNoticed}>Open source</ReaderButton>
      </div>
    );
  }
  if (lookup.offer) {
    return (
      <div className="capture-follow-up">
        <p>
          Reader couldn’t open that page, but it found the citation for “{lookup.offer.title}”. You
          can save the citation now and attach the page or file later.
        </p>
        <ProblemDetails detail={lookup.offer.reason} />
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
      <CitationSummary citation={offer.candidate.citation} />
      {offer.books.length ? (
        <>
          <label>
            Attach to the matching book
            <select value={book} disabled={busy} onChange={(event) => setBook(event.target.value)}>
              <option value="">Choose the correct book edition</option>
              {offer.books.map((source) => (
                <option key={source.id} value={source.id}>
                  {bookOptionLabel(source)}
                </option>
              ))}
            </select>
          </label>
          {offer.books
            .filter(({ id }) => id === book)
            .map((source) => (
              <details key={source.id}>
                <summary>Preview the chapter citation with the book’s details</summary>
                <CitationSummary
                  citation={
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
                    ).citation
                  }
                />
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
          <CitationSummary citation={lookup.bookOffer.citation} />
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

/** The error behind a plain message, for anyone who wants to report or look into it. */
function ProblemDetails({ detail }: { readonly detail: string | undefined }): JSX.Element | null {
  return detail ? (
    <details>
      <summary>Details</summary>
      <p>{detail}</p>
    </details>
  ) : null;
}

/** The fields a reader checks before confirming a citation; the full record stays one step away. */
function CitationSummary({
  citation,
}: {
  readonly citation: Readonly<Record<string, unknown>> | null;
}): JSX.Element | null {
  if (!citation) {
    return null;
  }
  const fields: readonly (readonly [string, string])[] = [
    ["Title", citationText(citation, "title")],
    ["Authors", citationNames(citation, "author").map(displayCslValue).join(", ")],
    ["Published in", citationText(citation, "container-title")],
    ["Year", /\d{4}/u.exec(citationDateText(citation, "issued"))?.[0] ?? ""],
    ["Pages", citationText(citation, "page")],
    ["DOI", citationText(citation, "DOI")],
  ];
  return (
    <>
      <dl className="capture-citation-fields">
        {fields
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <details>
        <summary>Full citation (CSL-JSON)</summary>
        <pre>{JSON.stringify(citation, null, 2)}</pre>
      </details>
    </>
  );
}

/** Editions often share a title, so the ISBN and year tell them apart. */
function bookOptionLabel(source: SourceSummary): string {
  const published = source.published ?? citationDateText(source.citation ?? {}, "issued");
  const year = /\d{4}/u.exec(String(published))?.[0];
  const isbn = citationText(source.citation ?? {}, "ISBN");
  return [source.title, isbn && `ISBN ${isbn}`, year].filter(Boolean).join(" · ");
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
