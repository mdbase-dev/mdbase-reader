import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useRef, useState, type JSX } from "react";

import type { FileImportSuggestion } from "./file-import-suggestion.js";
import type { SourceImportFlow } from "./use-source-import.js";
import type { PickedFile } from "@mdbase-reader/platform";

export function SourceImportDialog({
  file,
  importing,
  progress,
  error,
  onCancel,
  onImport,
  suggestion = null,
}: {
  readonly file: PickedFile;
  readonly importing: boolean;
  readonly progress: SourceImportFlow["progress"];
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onImport: (title: string, useCitation: boolean) => void;
  readonly suggestion?: FileImportSuggestion | null;
}): JSX.Element {
  const [typedTitle, setTypedTitle] = useState<string | null>(null);
  const [useCitation, setUseCitation] = useState(true);
  const title = typedTitle ?? suggestion?.title ?? titleFromName(file.name);
  const titleInput = useRef<HTMLInputElement>(null);
  const isFinalizing = importing && progress?.phase === "creating";
  const submit = (): void => onImport(title, useCitation && Boolean(suggestion?.citation));

  useEffect(() => {
    titleInput.current?.focus();
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isFinalizing) {
        onCancel();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [isFinalizing, onCancel]);

  return (
    <div className="import-backdrop" role="presentation">
      <section
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-import-title"
      >
        <div className="import-dialog-heading">
          <h2 id="reader-import-title">Add source</h2>
          <p>The original file stays intact in your collection.</p>
        </div>
        <div className="import-file-summary">
          <span className="import-format">{formatLabel(file)}</span>
          <span>
            <strong>{file.name}</strong>
            <small>{formatBytes(file.size)}</small>
          </span>
        </div>
        <label className="import-title-field">
          <span>Title</span>
          <input
            ref={titleInput}
            value={title}
            disabled={importing}
            onChange={(event) => setTypedTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && title.trim()) {
                submit();
              }
            }}
          />
        </label>
        <FoundCitation
          suggestion={suggestion}
          checked={useCitation}
          disabled={importing}
          onChange={setUseCitation}
        />
        {error ? (
          <p className="import-error" role="alert">
            {error}
          </p>
        ) : null}
        {importing ? <ImportProgress progress={progress} /> : null}
        <div className="import-dialog-actions">
          <button
            className="connection-secondary"
            type="button"
            onClick={onCancel}
            disabled={isFinalizing}
          >
            {isFinalizing ? "Finishing…" : importing ? "Stop import" : "Cancel"}
          </button>
          <ReaderButton disabled={importing || !title.trim()} onClick={submit}>
            {importing ? "Importing…" : "Add source"}
          </ReaderButton>
        </div>
      </section>
    </div>
  );
}

export function SourceImportOverlay({
  flow,
}: {
  readonly flow: SourceImportFlow;
}): JSX.Element | null {
  return flow.file ? (
    <SourceImportDialog
      file={flow.file}
      importing={flow.importing}
      progress={flow.progress}
      error={flow.error}
      onCancel={flow.cancel}
      onImport={(title, useCitation) => void flow.importFile(title, useCitation)}
      suggestion={flow.suggestion}
    />
  ) : null;
}

/** The citation found from the file's DOI, arXiv ID or ISBN, which can be saved with it. */
function FoundCitation({
  suggestion,
  checked,
  disabled,
  onChange,
}: {
  readonly suggestion: FileImportSuggestion | null;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element | null {
  if (!suggestion) {
    return (
      <p className="import-found-citation" role="status">
        Reading the file’s details…
      </p>
    );
  }
  const citation = suggestion.citation;
  if (!citation) {
    return null;
  }
  return (
    <label className="import-found-citation">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        Save the citation found for this file: {citationLine(citation.citation)}
        <small>{citation.provenance.provider}</small>
      </span>
    </label>
  );
}

function citationLine(citation: Readonly<Record<string, unknown>>): string {
  const authors = Array.isArray(citation["author"])
    ? (citation["author"] as readonly { family?: string; literal?: string }[])
    : [];
  const first = authors[0]?.family ?? authors[0]?.literal;
  const issued = citation["issued"] as { "date-parts"?: unknown[][] } | undefined;
  const year = issued?.["date-parts"]?.[0]?.[0];
  return [
    first ? `${first}${authors.length > 1 ? " et al." : ""}` : null,
    typeof year === "number" || typeof year === "string" ? `(${String(year)})` : null,
    typeof citation["title"] === "string" ? `“${citation["title"]}”` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function ImportProgress({
  progress,
}: {
  readonly progress: SourceImportFlow["progress"];
}): JSX.Element {
  const value =
    progress?.phase === "uploading" && progress.totalBytes
      ? Math.round((progress.completedBytes / progress.totalBytes) * 100)
      : undefined;
  const label =
    progress?.phase === "uploading"
      ? `Uploading file ${String(progress.fileIndex)} of ${String(progress.fileCount)}`
      : progress?.phase === "creating"
        ? "Creating source record"
        : "Checking file and library";
  return (
    <div className="import-progress" role="status" aria-live="polite">
      <span>
        {label} {value === undefined ? null : <strong>{String(value)}%</strong>}
      </span>
      <progress max={100} {...(value === undefined ? {} : { value })} aria-label={label} />
    </div>
  );
}

function titleFromName(name: string): string {
  return name
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/gu, " ")
    .trim();
}

function formatLabel(file: PickedFile): string {
  if (file.mediaType.includes("pdf") || file.name.toLocaleLowerCase().endsWith(".pdf")) {
    return "PDF";
  }
  if (file.mediaType.includes("epub") || file.name.toLocaleLowerCase().endsWith(".epub")) {
    return "EPUB";
  }
  return "HTML";
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${String(size)} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
