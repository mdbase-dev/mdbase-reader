import { ReaderButton } from "@mdbase-reader/ui";

import { NoteIcon } from "./icons.js";

import type { ReadingResumeState } from "./use-reading-resume.js";
import type { JSX } from "react";

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

export function DocumentEmpty({ onOpenNote }: { readonly onOpenNote: () => void }): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <NoteIcon />
        <h2>No document attached</h2>
        <p>
          This is a note-only source. Its note, annotations and citation are in the Notes panel.
        </p>
        <ReaderButton onClick={onOpenNote}>Open source note</ReaderButton>
      </div>
    </div>
  );
}
