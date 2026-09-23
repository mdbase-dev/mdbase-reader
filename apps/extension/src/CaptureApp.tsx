import { useEffect } from "react";

import { readerSourceUrl } from "./capture-model.js";
import { ConnectionPanel, ConnectionProblem } from "./ConnectionPanel.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

export function CaptureApp({ controller }: ControllerProps): React.JSX.Element {
  useEffect(() => {
    document.title = `mdbase Reader — ${controller.source ? "source saved" : "capture"}`;
  }, [controller.source]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent): void => {
      if (
        controller.busy ||
        controller.draft.comment ||
        (!controller.source && controller.draft.note)
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [controller.busy, controller.draft, controller.source]);
  return (
    <main className="capture-shell">
      <header>
        <span className="mark" aria-hidden="true">
          ▦
        </span>
        <strong>
          mdbase <i>reader</i>
        </strong>
        <span className="connection">LAB</span>
      </header>
      <section className="page-card">
        <span className="eyebrow">CURRENT PAGE</span>
        <h1>{controller.capture?.pageTitle ?? "Reading the page…"}</h1>
        <p>
          {controller.capture
            ? new URL(controller.capture.canonicalUrl).hostname
            : "Waiting for the active tab"}
        </p>
      </section>
      <ConnectionPanel controller={controller} />
      <ConnectionProblem controller={controller} />
      <CaptureForm controller={controller} />
      <CaptureStatus controller={controller} />
      <Completion controller={controller} />
    </main>
  );
}

function CaptureForm({ controller: c }: ControllerProps): React.JSX.Element | null {
  if (!c.capture) {
    return null;
  }
  const update = (field: "title" | "tags" | "note" | "comment", value: string): void =>
    c.setDraft((draft) => ({ ...draft, [field]: value }));
  return (
    <form
      className="capture-form"
      onSubmit={(event) => {
        event.preventDefault();
        void c.save();
      }}
    >
      <fieldset disabled={c.busy}>
        {!c.source ? (
          <>
            <label htmlFor="title">Title</label>
            <input
              id="title"
              value={c.draft.title}
              maxLength={300}
              required
              onChange={(event) => update("title", event.target.value)}
            />
            <label htmlFor="tags">
              Tags <span>(comma-separated, optional)</span>
            </label>
            <input
              id="tags"
              value={c.draft.tags}
              onChange={(event) => update("tags", event.target.value)}
            />
            <label htmlFor="note">
              Source note <span>(optional)</span>
            </label>
            <textarea
              id="note"
              value={c.draft.note}
              rows={2}
              onChange={(event) => update("note", event.target.value)}
            />
          </>
        ) : (
          <p className="saved-summary">
            {c.status === "existing" ? "Already in" : "Saved to"} this collection:{" "}
            <strong>{c.source.title}</strong>. Existing source metadata is kept unchanged.
          </p>
        )}
        {c.capture.selection ? (
          <section aria-label="Selected passage">
            <blockquote>{c.capture.selection.exact}</blockquote>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={c.draft.highlight}
                onChange={(event) =>
                  c.setDraft((draft) => ({ ...draft, highlight: event.target.checked }))
                }
              />
              Save this highlight
            </label>
            {c.draft.highlight ? (
              <>
                <label htmlFor="comment">
                  Highlight note <span>(optional)</span>
                </label>
                <textarea
                  id="comment"
                  value={c.draft.comment}
                  rows={3}
                  onChange={(event) => update("comment", event.target.value)}
                />
                <p className="hint">
                  Anchored to the saved reading copy. If that passage cannot be matched safely, your
                  note stays here.
                </p>
              </>
            ) : null}
          </section>
        ) : (
          <p className="hint">
            To highlight, select text on the page and right-click → Save highlight to mdbase Reader.
          </p>
        )}
        <button type="button" className="text-button" onClick={() => void c.readSelection()}>
          Capture current selection
        </button>
        {!c.source || c.draft.highlight ? (
          <button
            className="primary"
            disabled={c.snapshot.status !== "ready" || c.busy || !c.draft.title.trim()}
            type="submit"
          >
            {c.busy
              ? c.status === "saving" || c.progress
                ? "Saving…"
                : "Please wait…"
              : c.draft.highlight
                ? c.source
                  ? "Save highlight"
                  : "Save source and highlight"
                : "Save source"}
          </button>
        ) : null}
      </fieldset>
    </form>
  );
}

function CaptureStatus({ controller: c }: ControllerProps): React.JSX.Element {
  const p = c.progress;
  const progress =
    p?.phase === "uploading"
      ? `Uploading file ${String(p.fileIndex)} of ${String(p.fileCount)} · ${String(p.totalBytes ? Math.round((p.completedBytes / p.totalBytes) * 100) : 0)}%`
      : p?.phase === "creating"
        ? "Saving source record…"
        : p
          ? "Checking for duplicates…"
          : null;
  return (
    <div className="save-status" role="status" aria-live="polite">
      {progress ??
        (c.busy
          ? "Working…"
          : c.source
            ? "Source saved in mdbase."
            : c.saveAttempted
              ? "Save not confirmed. Retry to check its outcome."
              : "Not saved yet.")}
      {c.notice ? <p>{c.notice}</p> : null}
    </div>
  );
}

function Completion({ controller: c }: ControllerProps): React.JSX.Element | null {
  if (!c.source) {
    return null;
  }
  const count = c.annotations.filter((annotation) => annotation.target?.quote).length;
  return (
    <footer className="completion">
      {count ? (
        <button
          type="button"
          className="secondary"
          disabled={c.busy}
          onClick={() => void c.showAnnotations()}
        >
          Show {count} highlight{count === 1 ? "" : "s"} on this page
        </button>
      ) : null}
      {c.projection ? (
        <div role="status" className="render-result">
          <p>
            {c.projection.shown} of {c.projection.total} highlights shown.
          </p>
          {c.projection.missing ? (
            <p>{c.projection.missing} passage(s) could not be found; the page may have changed.</p>
          ) : null}
          {c.projection.ambiguous ? (
            <p>
              {c.projection.ambiguous} passage(s) match more than once. Reader has not guessed a
              location.
            </p>
          ) : null}
          {c.projection.missing + c.projection.ambiguous > 0 ? (
            <p>Your annotations remain safe in the saved copy.</p>
          ) : null}
        </div>
      ) : null}
      <a
        className="primary reader-link"
        href={readerSourceUrl(c.source)}
        target="_blank"
        rel="noreferrer"
      >
        Open saved copy in Reader
      </a>
      <button className="secondary" type="button" disabled={c.busy} onClick={() => window.close()}>
        Continue reading
      </button>
    </footer>
  );
}

interface ControllerProps {
  readonly controller: ExtensionCaptureController;
}
