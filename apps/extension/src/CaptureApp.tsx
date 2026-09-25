import { MdbaseMark } from "@mdbase-reader/ui";
import { useEffect } from "react";

import { readerSourceUrl } from "./capture-model.js";
import { CaptureForm } from "./CaptureForm.js";
import { ConnectionPanel, ConnectionProblem } from "./ConnectionPanel.js";
import { environment } from "./environment.js";
import { PageStatusSetting } from "./PageStatusSetting.js";

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
      <header>
        <MdbaseMark className="mark" />
        <strong>
          mdbase <i>reader</i>
        </strong>
        {environment.label ? <span className="connection">{environment.label}</span> : null}
      </header>
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
      <PageStatusSetting />
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
