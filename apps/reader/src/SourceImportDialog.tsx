import { i18n } from "@lingui/core";
import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ReaderButton } from "@mdbase-reader/ui";
import { useRef, useState, type JSX } from "react";

import { htmlFileTitle } from "./document-details.js";
import { ModalDialog } from "./ModalDialog.js";
import { SourceAdditionError } from "./SourceAddDialog.js";

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
  stopped = false,
}: {
  readonly file: PickedFile;
  readonly importing: boolean;
  readonly progress: SourceImportFlow["progress"];
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onImport: (title: string, useCitation: boolean) => void;
  readonly suggestion?: FileImportSuggestion | null;
  readonly stopped?: boolean;
}): JSX.Element {
  const { t } = useLingui();
  const [typedTitle, setTypedTitle] = useState<string | null>(null);
  const [useCitation, setUseCitation] = useState(true);
  const [fileTitle] = useState(
    () => htmlFileTitle({ ...file, bytes: new Uint8Array(file.bytes) }) ?? titleFromName(file.name),
  );
  const title = typedTitle ?? suggestion?.title ?? fileTitle;
  const titleInput = useRef<HTMLInputElement>(null);
  const isFinalizing = importing && progress?.phase === "creating";
  const submit = (): void => onImport(title, useCitation && Boolean(suggestion?.citation));

  return (
    <ModalDialog
      className="import-dialog"
      labelledBy="reader-import-title"
      initialFocus={titleInput}
      onDismiss={() => {
        if (!isFinalizing) {
          onCancel();
        }
      }}
    >
      <div className="import-dialog-heading">
        <h2 id="reader-import-title">
          <Trans>Add source</Trans>
        </h2>
        <p>
          <Trans>The original file stays intact in your collection.</Trans>
        </p>
      </div>
      <ImportFileSummary file={file} importing={importing} progress={progress} />
      <label
        className="import-title-field"
        htmlFor="reader-import-source-title"
        aria-label={t`Title`}
      >
        <span>
          <Trans>Title</Trans>
        </span>
        <input
          className="mdbase-field"
          ref={titleInput}
          id="reader-import-source-title"
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
      {error ? <ImportFailure error={error} progress={progress} /> : null}
      {stopped ? (
        <p role="status">
          <Trans>Stopped adding. Check pending changes before trying again.</Trans>
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
          {isFinalizing
            ? translate({ message: "Finishing adding…" })
            : importing
              ? translate({ message: "Stop adding" })
              : t({ message: "Cancel", context: "SourceImportDialog interface" })}
        </button>
        <ReaderButton disabled={importing || !title.trim()} onClick={submit}>
          {importing
            ? translate({ message: "Adding…" })
            : t({ message: "Add source", context: "SourceImportDialog interface" })}
        </ReaderButton>
      </div>
    </ModalDialog>
  );
}

function ImportFailure({
  error,
  progress,
}: Pick<SourceImportFlow, "progress"> & { readonly error: string }): JSX.Element {
  return (
    <SourceAdditionError error={error}>
      {error.includes("the live upload request changed") ||
      progress?.phase === "checking" ||
      progress?.phase === "recovering" ? (
        <Trans>This file wasn’t added. Close this and try again.</Trans>
      ) : (
        <Trans>
          Couldn’t confirm this file was added. Check pending changes and your library before trying
          again.
        </Trans>
      )}
    </SourceAdditionError>
  );
}

function ImportFileSummary({
  file,
  importing,
  progress,
}: Pick<SourceImportFlow, "file" | "importing" | "progress"> & {
  readonly file: PickedFile;
}): JSX.Element {
  const transferred =
    progress &&
    (progress.phase === "uploading" || progress.phase === "creating") &&
    progress.totalBytes > 0 &&
    progress.completedBytes >= progress.totalBytes;
  return (
    <div className="import-file-summary" aria-busy={importing}>
      <span className="import-format">{formatLabel(file)}</span>
      <span>
        <strong>{file.name}</strong>
        <small>{formatBytes(file.size)}</small>
        {importing && transferred ? (
          <small>
            <Trans>File transferred · Pending confirmation</Trans>
          </small>
        ) : null}
      </span>
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
      stopped={flow.stopped}
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
  const { t } = useLingui();
  if (!suggestion) {
    return (
      <p className="import-found-citation" role="status">
        <Trans>Reading the file’s details…</Trans>
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
        {t({ message: "Save the citation found for this file:" })}
        {citationLine(citation.citation)}
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
  const { t } = useLingui();
  const value =
    progress?.phase === "uploading" &&
    progress.totalBytes &&
    progress.completedBytes < progress.totalBytes
      ? Math.round((progress.completedBytes / progress.totalBytes) * 100)
      : undefined;
  const label =
    progress?.phase === "uploading"
      ? progress.completedBytes >= progress.totalBytes
        ? t`File transferred. Waiting for the collection to confirm it…`
        : t`Uploading file ${String(progress.fileIndex)} of ${String(progress.fileCount)}`
      : progress?.phase === "recovering"
        ? translate({ message: "Checking previously added files" })
        : progress?.phase === "creating"
          ? t`Creating source record`
          : t`Checking file and library`;
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
    return `${(size / 1024).toLocaleString(i18n.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`;
  }
  return `${(size / (1024 * 1024)).toLocaleString(i18n.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}
