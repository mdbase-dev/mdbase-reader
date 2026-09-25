import { useEffect } from "react";

import { readerSourceUrl } from "./capture-model.js";
import { CaptureForm } from "./CaptureForm.js";
import { ConnectionPanel, ConnectionProblem } from "./ConnectionPanel.js";
import { ExtensionHeader } from "./ExtensionHeader.js";
import { openSettings } from "./shortcuts.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

export function CaptureApp({ controller }: ControllerProps): React.JSX.Element {
  useEffect(() => {
    document.title = `mdbase Reader — ${controller.source ? "source saved" : "capture"}`;
  }, [controller.source]);
  useEffect(() => {
    // Drafts survive closing the panel; an in-flight save's outcome would not be shown.
    const warn = (event: BeforeUnloadEvent): void => {
      if (controller.busy) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [controller.busy]);
  return (
    <main className="capture-shell">
      <ExtensionHeader
        collectionId={
          "collectionId" in controller.snapshot ? controller.snapshot.collectionId : null
        }
      />
      <section className="page-card">
        <span className="eyebrow">
          {controller.capture?.kind === "pdf" ? "CURRENT PDF" : "CURRENT PAGE"}
        </span>
        <h1>{controller.capture?.pageTitle ?? "Reading the page…"}</h1>
        <p>
          {controller.capture
            ? new URL(controller.capture.canonicalUrl).hostname
            : "Waiting for the active tab"}
        </p>
      </section>
      <Navigated controller={controller} />
      <ConnectionPanel controller={controller} />
      <ConnectionProblem controller={controller} />
      {controller.draftRestored ? (
        <p className="restored" role="status">
          Restored your unsaved note from earlier.
        </p>
      ) : null}
      <CaptureForm controller={controller} />
      <CaptureStatus controller={controller} />
      <Completion controller={controller} />
      <footer className="panel-footer">
        <button type="button" className="text-button" onClick={openSettings}>
          Settings and shortcuts
        </button>
      </footer>
    </main>
  );
}

function Navigated({ controller: c }: ControllerProps): React.JSX.Element | null {
  if (!c.navigated) {
    return null;
  }
  return (
    <section className="problem" role="alert">
      <strong>This tab has moved to another page.</strong>
      <p>
        Press the mdbase Reader toolbar button (Alt+Shift+S) to continue on the new page. Your
        unsaved text for the previous page is kept for this browser session.
      </p>
    </section>
  );
}

/** Reports progress and outcomes; says nothing while the panel is simply waiting. */
function CaptureStatus({ controller: c }: ControllerProps): React.JSX.Element {
  const progress = importProgressMessage(c.busy ? c.progress : null);
  const message =
    progress ??
    (c.status === "saving"
      ? "Saving…"
      : c.status === "saved"
        ? "Source saved in mdbase."
        : c.saveAttempted && !c.source && !c.busy
          ? "Save not confirmed. Retry to check its outcome."
          : null);
  // The live region stays mounted so screen readers announce what appears in it.
  return (
    <div className="save-status" role="status" aria-live="polite">
      {message ? <p>{message}</p> : null}
      {c.refreshing ? <p>Saved. Refreshing highlights…</p> : null}
      {c.notice ? <p>{c.notice}</p> : null}
      {c.source ? (
        <button
          type="button"
          disabled={c.busy || c.refreshing}
          onClick={() => void c.refreshHighlights()}
        >
          Refresh highlights
        </button>
      ) : null}
    </div>
  );
}

function importProgressMessage(p: ExtensionCaptureController["progress"]): string | null {
  switch (p?.phase) {
    case "uploading":
      return `Uploading file ${String(p.fileIndex)} of ${String(p.fileCount)} · ${String(p.totalBytes ? Math.round((p.completedBytes / p.totalBytes) * 100) : 0)}%`;
    case "recovering":
      return "Checking files from the previous save attempt…";
    case "creating":
      return "Saving source record…";
    case "checking":
      return "Checking for duplicates…";
    default:
      return null;
  }
}

function Completion({ controller: c }: ControllerProps): React.JSX.Element | null {
  if (!c.source) {
    return null;
  }
  const count = c.annotations.filter((annotation) => annotation.target?.quote).length;
  return (
    <footer className="completion">
      {count && c.capture?.kind === "html" ? (
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
    </footer>
  );
}

interface ControllerProps {
  readonly controller: ExtensionCaptureController;
}
