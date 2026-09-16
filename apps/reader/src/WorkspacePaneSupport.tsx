import { ReaderButton } from "@mdbase-reader/ui";

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
  if (reading.status === "idle") {
    return <span className="reading-position-status" />;
  }
  const label =
    reading.status === "saving"
      ? "Saving position…"
      : reading.status === "saved"
        ? "Position saved"
        : (reading.message ?? "Position not saved");
  return (
    <span className={`reading-position-status is-${reading.status}`} title={label}>
      {reading.status === "error" ? "Position not saved" : label}
    </span>
  );
}

export function DocumentEmpty({ onAddSource }: { readonly onAddSource: () => void }): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">Note-only source</span>
        <h2>There’s no document to read.</h2>
        <p>The source note, annotations, and citation remain available in Source tools.</p>
        <ReaderButton onClick={onAddSource}>Add another source</ReaderButton>
      </div>
    </div>
  );
}
