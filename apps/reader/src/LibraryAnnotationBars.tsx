import { useState, type JSX } from "react";

import { annotationsToMarkdown, type AnnotationEntry } from "./annotation-overview.js";
import { countLabel } from "./LibraryCells.js";

import type { AnnotationsLoad } from "./use-library-annotations.js";

/** The selected annotations' actions, shown while any are selected. */
export function AnnotationSelectionBar({
  selected,
  onClear,
}: {
  readonly selected: readonly AnnotationEntry[];
  readonly onClear: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (): void => {
    void globalThis.navigator.clipboard
      .writeText(annotationsToMarkdown(selected))
      .then(() => setCopied(`Copied ${countLabel(selected.length, "annotation")} as Markdown.`))
      .catch(() => setCopied("Copying needs clipboard permission."));
  };
  return (
    <div className="library-bulk-bar" role="toolbar" aria-label="Selected annotations">
      <strong aria-live="polite">{countLabel(selected.length, "annotation")} selected</strong>
      <button type="button" onClick={copy}>
        Copy as Markdown
      </button>
      {copied ? (
        <span
          className={
            copied.startsWith("Copied")
              ? "library-bulk-progress mdbase-settle"
              : "library-bulk-progress"
          }
          role="status"
        >
          {copied}
        </span>
      ) : null}
      <button type="button" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

/** Why annotations could not be listed, or why the view is filtered by Reader. */
export function AnnotationProblem({
  load,
  executionProblem,
  onRetry,
}: {
  readonly load: AnnotationsLoad;
  readonly executionProblem: string | null;
  readonly onRetry: () => void;
}): JSX.Element | null {
  if (load.status === "error") {
    return (
      <div className="library-view-problem" role="alert">
        {load.message}{" "}
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <>
      {executionProblem ? (
        <div className="library-view-problem" role="status">
          {executionProblem}
        </div>
      ) : null}
      {load.status === "loading" || load.loading ? (
        <div className="inspector-status" role="status">
          Loading annotations…
        </div>
      ) : null}
    </>
  );
}
