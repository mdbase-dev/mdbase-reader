import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useRef, useState, type JSX } from "react";

import { CloseIcon, FileIcon } from "./icons.js";

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
          <p>Save a web page, or add a PDF or EPUB from your device.</p>
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
            <span>Web page</span>
            <span className="capture-url-row">
              <input
                ref={input}
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="Paste a link: https://…"
                value={url}
                disabled={busy}
                onChange={(event) => {
                  setUrl(event.target.value);
                  onEdit();
                }}
              />
              <ReaderButton disabled={busy || !url.trim()}>
                {busy ? "Saving…" : "Save"}
              </ReaderButton>
            </span>
          </label>
          {error ? (
            <p className="import-error capture-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
        <div className="source-add-divider">
          <span>or</span>
        </div>
        <FileChoice disabled={busy || !canChooseFile} onChoose={onChooseFile} onDrop={onDropFile} />
      </section>
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
