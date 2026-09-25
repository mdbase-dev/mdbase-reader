import { ReaderButton } from "@mdbase-reader/ui";
import { useRef, useState } from "react";

import { NoteIcon } from "./icons.js";

import type { DocumentAttachmentController } from "./use-document-attachment.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { DragEvent, JSX } from "react";

export function DocumentStatus({
  reading,
  decorationProblem,
}: {
  readonly reading: ReadingResumeState;
  readonly decorationProblem: string | null;
}): JSX.Element {
  if (decorationProblem) {
    return (
      <span className="reading-position-status is-error" title={decorationProblem}>
        Highlights unavailable
      </span>
    );
  }
  // Saving and saved are routine; only a failure needs the reader's attention.
  if (reading.status !== "error") {
    return <span className="reading-position-status" />;
  }
  return (
    <span
      className="reading-position-status is-error"
      title={reading.message ?? "Reader could not save your place in this document."}
    >
      Position not saved
    </span>
  );
}

export function DocumentEmpty({
  onOpenNote,
  source,
  attachment = null,
}: {
  readonly onOpenNote: () => void;
  readonly source?: SourceSummary;
  readonly attachment?: DocumentAttachmentController | null;
}): JSX.Element {
  const target = attachment && source ? { attachment, source } : null;
  const state = attachmentState(target);
  const busy = state?.busy === true;
  const drop = useAttachDrop(
    target && !busy ? (file) => target.attachment.dropFile(target.source, file) : null,
  );
  return (
    <div className={`document-empty${drop.active ? " is-dragging" : ""}`} {...drop.handlers}>
      <div>
        <NoteIcon />
        <h2>{drop.active ? "Drop to attach" : "No document attached"}</h2>
        <p>
          This source has no file yet. Its literature note, annotations and citation are in the
          Source panel.
          {target ? " Attach a PDF, EPUB or saved page, or drop one here." : ""}
        </p>
        {target ? (
          <AttachmentActions {...target} busy={busy} onOpenNote={onOpenNote} />
        ) : (
          <ReaderButton onClick={onOpenNote}>Open literature note</ReaderButton>
        )}
        <AttachmentStatus state={state} />
      </div>
    </div>
  );
}

function attachmentState(
  target: {
    readonly attachment: DocumentAttachmentController;
    readonly source: SourceSummary;
  } | null,
): DocumentAttachmentController["state"] {
  const state = target?.attachment.state;
  return state?.sourceId === target?.source.id ? (state ?? null) : null;
}

function AttachmentActions({
  attachment,
  source,
  busy,
  onOpenNote,
}: {
  readonly attachment: DocumentAttachmentController;
  readonly source: SourceSummary;
  readonly busy: boolean;
  readonly onOpenNote: () => void;
}): JSX.Element {
  return (
    <div className="document-empty-actions">
      {attachment.canChooseFile ? (
        <ReaderButton disabled={busy} onClick={() => attachment.chooseFile(source)}>
          Attach a file
        </ReaderButton>
      ) : null}
      {attachment.canFindPdf(source) ? (
        <button
          className="connection-secondary"
          type="button"
          disabled={busy}
          onClick={() => attachment.findPdf(source)}
        >
          Find an open-access PDF
        </button>
      ) : null}
      <button className="connection-secondary" type="button" onClick={onOpenNote}>
        Open literature note
      </button>
    </div>
  );
}

function AttachmentStatus({
  state,
}: {
  readonly state: DocumentAttachmentController["state"];
}): JSX.Element | null {
  if (state?.error) {
    return (
      <p className="document-empty-status is-error" role="alert">
        {state.error}
      </p>
    );
  }
  return state?.message ? (
    <p className="document-empty-status" role="status">
      {state.message}
    </p>
  ) : null;
}

/**
 * Files dropped here attach to this source. Its drag events stay out of the shell's handler,
 * which would otherwise offer to add the file as a new source.
 */
function useAttachDrop(onFile: ((file: File) => void) | null): {
  readonly active: boolean;
  readonly handlers: Partial<
    Record<"onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop", (event: DragEvent) => void>
  >;
} {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  if (!onFile) {
    return { active: false, handlers: {} };
  }
  const own = (event: DragEvent): boolean => {
    if (!event.dataTransfer.types.includes("Files")) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  return {
    active,
    handlers: {
      onDragEnter: (event) => {
        if (own(event)) {
          depth.current += 1;
          setActive(true);
        }
      },
      onDragOver: (event) => {
        if (own(event)) {
          event.dataTransfer.dropEffect = "copy";
        }
      },
      onDragLeave: (event) => {
        if (own(event)) {
          depth.current = Math.max(0, depth.current - 1);
          setActive(depth.current > 0);
        }
      },
      onDrop: (event) => {
        if (own(event)) {
          depth.current = 0;
          setActive(false);
          const file = event.dataTransfer.files[0];
          if (file) {
            onFile(file);
          }
        }
      },
    },
  };
}
