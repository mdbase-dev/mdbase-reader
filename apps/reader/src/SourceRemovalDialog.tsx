import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, type JSX } from "react";

import type { SourceRemovalController } from "./use-source-removal.js";

/** Lists at most this many linking records; the rest are counted. */
const shownLinks = 8;

/** Confirms removing one source, after Reader has checked what links to it. */
export function SourceRemovalDialog({
  removal,
}: {
  readonly removal: SourceRemovalController;
}): JSX.Element | null {
  const { pending } = removal;
  return pending ? <OpenSourceRemovalDialog removal={removal} pending={pending} /> : null;
}

interface OpenSourceRemovalDialogProps {
  readonly removal: SourceRemovalController;
  readonly pending: NonNullable<SourceRemovalController["pending"]>;
}

function OpenSourceRemovalDialog({ removal, pending }: OpenSourceRemovalDialogProps): JSX.Element {
  const { t } = useLingui();
  const { source, status, plan, problem } = pending;
  const removing = status === "removing";
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { cancel } = removal;
  useEffect(() => {
    // The safe choice takes focus, so Enter alone never removes anything.
    cancelRef.current?.focus();
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [cancel]);
  const links = plan?.brokenLinkPaths ?? [];
  return (
    <div
      className="import-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          cancel();
        }
      }}
    >
      <section
        className="import-dialog source-removal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reader-remove-source-title"
        aria-describedby="reader-remove-source-description"
      >
        <div className="import-dialog-heading">
          <h2 id="reader-remove-source-title">
            <Trans>Remove “{source.title}”?</Trans>
          </h2>
          <p id="reader-remove-source-description">
            <Trans>
              This removes the source from your library and deletes its source note. Saved files and
              annotation notes are kept in the collection. Links to this source will stop working.
              Reader cannot undo this.
            </Trans>
          </p>
        </div>
        <div className="source-removal-details">
          {status === "checking" ? (
            <p role="status">
              <Trans>Checking what links to this source…</Trans>
            </p>
          ) : links.length > 0 ? (
            <>
              <p>
                <Plural
                  value={links.length}
                  one="This record links to it and will show a broken link:"
                  other="These # records link to it and will show a broken link:"
                />
              </p>
              <ul>
                {links.slice(0, shownLinks).map((path) => (
                  <li key={path}>{path}</li>
                ))}
                {links.length > shownLinks ? (
                  <li>
                    <Trans>
                      and
                      {String(links.length - shownLinks)}
                      more
                    </Trans>
                  </li>
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
            <Trans>Cancel</Trans>
          </button>
          {problem && !plan ? (
            <button
              className="connection-secondary"
              type="button"
              onClick={() => removal.request?.(source)}
            >
              <Trans>Check again</Trans>
            </button>
          ) : null}
          <button
            className="mdbase-button is-danger"
            type="button"
            disabled={status !== "confirming" || !plan}
            onClick={removal.confirm}
          >
            {removing
              ? t({ message: "Removing…", context: "SourceRemovalDialog interface" })
              : t({ message: "Remove source", context: "SourceRemovalDialog interface" })}
          </button>
        </div>
      </section>
    </div>
  );
}
