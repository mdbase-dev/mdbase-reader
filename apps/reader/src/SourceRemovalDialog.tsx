import { useRef, type JSX } from "react";

import { ModalDialog } from "./ModalDialog.js";

import type { SourceRemovalController } from "./use-source-removal.js";
import type { SourceSummary } from "@mdbase-reader/core";

/** Lists at most this many linking records; the rest are counted. */
const shownLinks = 8;

/** Confirms removing one source, after Reader has checked what links to it. */
export function SourceRemovalDialog({
  removal,
  sources = [],
}: {
  readonly removal: SourceRemovalController;
  /** Known sources, so a linking source is named by its title rather than its record path. */
  readonly sources?: readonly SourceSummary[];
}): JSX.Element | null {
  const { pending } = removal;
  return pending ? (
    <OpenSourceRemovalDialog removal={removal} pending={pending} sources={sources} />
  ) : null;
}

function OpenSourceRemovalDialog({
  removal,
  pending,
  sources,
}: {
  readonly removal: SourceRemovalController;
  readonly pending: NonNullable<SourceRemovalController["pending"]>;
  readonly sources: readonly SourceSummary[];
}): JSX.Element {
  const { source, status, plan, problem } = pending;
  const removing = status === "removing";
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { cancel } = removal;
  const links = plan?.brokenLinkPaths ?? [];
  // Annotations can only be moved between a book and its chapters.
  const inFamily = Boolean(source.partOf) || sources.some(({ partOf }) => partOf === source.id);
  return (
    <ModalDialog
      className="import-dialog source-removal-dialog"
      role="alertdialog"
      labelledBy="reader-remove-source-title"
      describedBy="reader-remove-source-description"
      initialFocus={cancelRef}
      onDismiss={() => {
        if (!removing) {
          cancel();
        }
      }}
    >
      <div className="import-dialog-heading">
        <h2 id="reader-remove-source-title">Remove “{source.title}”?</h2>
        <p id="reader-remove-source-description">
          This removes the source from your library and deletes its source note. Saved files and
          annotation notes are kept in the collection, but links to this source will stop working,
          including from its annotations and from any chapters of it.
          {source.partOf
            ? " To keep an annotation with the book or another chapter, cancel and use Move annotation on it first."
            : inFamily
              ? " To keep an annotation with one of its chapters, cancel and use Move annotation on it first."
              : null}{" "}
          Reader cannot undo this.
        </p>
      </div>
      <div className="source-removal-details">
        {status === "checking" ? (
          <p role="status">Checking what links to this source…</p>
        ) : links.length > 0 ? (
          <>
            <p>
              {links.length === 1 ? "This note links" : `These ${String(links.length)} notes link`}{" "}
              to it and will show a broken link:
            </p>
            <ul>
              {links.slice(0, shownLinks).map((path) => (
                <li key={path} title={path}>
                  {sources.find((item) => item.path === path)?.title ?? recordName(path)}
                </li>
              ))}
              {links.length > shownLinks ? (
                <li>and {String(links.length - shownLinks)} more</li>
              ) : null}
            </ul>
          </>
        ) : null}
        {problem ? (
          <p className="source-removal-problem" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
      <div className="import-dialog-actions">
        <button
          ref={cancelRef}
          className="connection-secondary"
          type="button"
          disabled={removing}
          onClick={cancel}
        >
          Cancel
        </button>
        {problem && !plan ? (
          <button
            className="connection-secondary"
            type="button"
            onClick={() => removal.request?.(source)}
          >
            Check again
          </button>
        ) : null}
        <button
          className="mdbase-button is-danger"
          type="button"
          disabled={status !== "confirming" || !plan}
          onClick={removal.confirm}
        >
          {removing ? "Removing…" : "Remove source"}
        </button>
      </div>
    </ModalDialog>
  );
}

/** A record without a known title is named by its file, without folders or extension. */
function recordName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.[^.]+$/u, "") || file;
}
