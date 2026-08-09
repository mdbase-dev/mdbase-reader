import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useRef, useState, type JSX } from "react";

import type { SourceImportFlow } from "./use-source-import.js";
import type { PickedFile } from "@mdbase-reader/platform";

export function SourceImportDialog({
  file,
  importing,
  error,
  onCancel,
  onImport,
}: {
  readonly file: PickedFile;
  readonly importing: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onImport: (title: string) => void;
}): JSX.Element {
  const [title, setTitle] = useState(() => titleFromName(file.name));
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleInput.current?.focus();
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !importing) {
        onCancel();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [importing, onCancel]);

  return (
    <div className="import-backdrop" role="presentation">
      <section
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-import-title"
      >
        <div className="import-dialog-heading">
          <span className="mono">New source</span>
          <h2 id="reader-import-title">Add to your library</h2>
          <p>The original file stays intact in this collection.</p>
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
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && title.trim()) {
                onImport(title);
              }
            }}
          />
        </label>
        {error ? (
          <p className="import-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="import-dialog-actions">
          <button
            className="connection-secondary"
            type="button"
            disabled={importing}
            onClick={onCancel}
          >
            Cancel
          </button>
          <ReaderButton disabled={importing || !title.trim()} onClick={() => onImport(title)}>
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
      error={flow.error}
      onCancel={flow.cancel}
      onImport={(title) => void flow.importFile(title)}
    />
  ) : null;
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
