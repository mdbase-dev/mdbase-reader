import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useRef, useState, type JSX } from "react";

import { CloseIcon, FileIcon, LinkIcon } from "./icons.js";

export function SourceAddDialog({
  open,
  busy,
  error,
  canChooseFile,
  onClose,
  onChooseFile,
  onCapture,
  onEdit,
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly canChooseFile: boolean;
  readonly onClose: () => void;
  readonly onChooseFile: () => void;
  readonly onCapture: (url: string) => void;
  readonly onEdit: () => void;
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
    <div className="import-backdrop" role="presentation">
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
          <span className="mono">New source</span>
          <h2 id="reader-add-source-title">Add to your library</h2>
          <p>Keep a readable copy with its source and provenance.</p>
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
          <label className="import-title-field capture-url-field">
            <span>Web address</span>
            <input
              ref={input}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://…"
              value={url}
              disabled={busy}
              onChange={(event) => {
                setUrl(event.target.value);
                onEdit();
              }}
            />
          </label>
          <p className="capture-explainer">
            Reader fetches without cookies, blocks private networks and scripts, and preserves the
            original HTML beside a clean reading copy.
          </p>
          {error ? (
            <p className="import-error capture-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="capture-primary-action">
            <ReaderButton disabled={busy || !url.trim()}>
              <LinkIcon /> {busy ? "Saving page…" : "Save web page"}
            </ReaderButton>
          </div>
        </form>
        <div className="source-add-divider">
          <span>or add a document</span>
        </div>
        <button
          className="source-file-choice"
          type="button"
          disabled={busy || !canChooseFile}
          onClick={onChooseFile}
        >
          <FileIcon />
          <span>
            <strong>Choose a file</strong>
            <small>PDF, EPUB, or saved HTML</small>
          </span>
        </button>
      </section>
    </div>
  );
}
