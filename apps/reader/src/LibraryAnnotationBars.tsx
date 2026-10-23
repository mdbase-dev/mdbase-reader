import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useState, type JSX } from "react";

import { annotationsToMarkdown, type AnnotationEntry } from "./annotation-overview.js";

import type { AnnotationsLoad } from "./use-library-annotations.js";

/** The selected annotations' actions, shown while any are selected. */
export function AnnotationSelectionBar({
  selected,
  onClear,
}: {
  readonly selected: readonly AnnotationEntry[];
  readonly onClear: () => void;
}): JSX.Element {
  const { t } = useLingui();
  const [copied, setCopied] = useState<{ message: string; success: boolean } | null>(null);
  const copy = (): void => {
    void globalThis.navigator.clipboard
      .writeText(annotationsToMarkdown(selected))
      .then(() =>
        setCopied({
          success: true,
          message: t({
            message: plural(selected.length, {
              one: "Copied # annotation as Markdown.",
              other: "Copied # annotations as Markdown.",
            }),
          }),
        }),
      )
      .catch(() => setCopied({ success: false, message: t`Copying needs clipboard permission.` }));
  };
  return (
    <div
      className="library-bulk-bar"
      role="toolbar"
      aria-label={t({
        message: "Selected annotations",
        context: "LibraryAnnotationBars interface",
      })}
    >
      <strong aria-live="polite">
        <Plural
          value={selected.length}
          one="# annotation selected"
          other="# annotations selected"
        />
      </strong>
      <button type="button" onClick={copy}>
        <Trans>Copy as Markdown</Trans>
      </button>
      {copied ? (
        <span
          className={
            copied.success ? "library-bulk-progress mdbase-settle" : "library-bulk-progress"
          }
          role="status"
        >
          {copied.message}
        </span>
      ) : null}
      <button type="button" onClick={onClear}>
        <Trans>Clear</Trans>
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
          <Trans context="Reader action">Try again</Trans>
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
          <Trans>Loading annotations…</Trans>
        </div>
      ) : null}
    </>
  );
}
