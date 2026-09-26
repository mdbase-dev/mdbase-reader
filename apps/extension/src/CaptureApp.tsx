import { useEffect } from "react";

import { readerSourceUrl } from "./capture-model.js";
import { CaptureForm } from "./CaptureForm.js";
import { ConnectionPanel, ConnectionProblem } from "./ConnectionPanel.js";
import { useDiagnosticsShown } from "./diagnostics-setting.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";
import { ExtensionHeader } from "./ExtensionHeader.js";
import { SavedHighlights } from "./SavedHighlights.js";
import { openSettings } from "./shortcuts.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

export function CaptureApp({ controller }: ControllerProps): React.JSX.Element {
  const [diagnostics] = useDiagnosticsShown();
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
      <ConnectionPanel controller={controller} compact />
      <CaptureForm controller={controller} />
      <PanelStatus controller={controller} />
      <SavedHighlights controller={controller} />
      <Completion controller={controller} />
      <footer className="panel-footer">
        <button type="button" className="text-button" onClick={openSettings}>
          Settings and shortcuts
        </button>
        {diagnostics ? <DiagnosticsPanel /> : null}
      </footer>
    </main>
  );
}

/** Only when the panel cannot follow by itself; while following, the status line says so. */
function Navigated({ controller: c }: ControllerProps): React.JSX.Element | null {
  if (!c.navigated || c.following) {
    return null;
  }
  return (
    <section className="problem" role="alert">
      <strong>This tab has moved to another page.</strong>
      <p>
        Press the mdbase Reader toolbar button (Alt+Shift+S) to continue on the new page. Your
        unsaved text for the previous page is kept for this browser session.
      </p>
      <p>
        To have the panel follow the tab by itself, turn on Saved pages in{" "}
        <button type="button" className="inline-link" onClick={openSettings}>
          Settings
        </button>
        .
      </p>
    </section>
  );
}

/**
 * One place for what is happening: a problem with its recovery, or else the single most
 * relevant status line. Says nothing while the panel is simply waiting.
 */
function PanelStatus({ controller: c }: ControllerProps): React.JSX.Element {
  const message = c.problem ? null : statusMessage(c);
  return (
    <>
      <ConnectionProblem controller={c} />
      {/* The live region stays mounted so screen readers announce what appears in it. */}
      <div className="save-status" role="status" aria-live="polite">
        {message ? <p>{message}</p> : null}
      </div>
    </>
  );
}

function statusMessage(c: ExtensionCaptureController): string | null {
  if (c.navigated && c.following) {
    return "Opening the new page…";
  }
  const progress = importProgressMessage(c.busy ? c.progress : null);
  if (progress) {
    return progress;
  }
  if (c.status === "saving") {
    return "Saving…";
  }
  if (c.notice) {
    return c.notice;
  }
  if (c.status === "saved") {
    return "Source saved in mdbase.";
  }
  if (c.saveAttempted && !c.source && !c.busy) {
    return "Save not confirmed. Retry to check its outcome.";
  }
  return c.draftRestored ? "Restored your unsaved note from earlier." : null;
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
  // A PDF's highlighting happens in Reader, so that is the next step, not an aside.
  const pdf = c.capture?.kind === "pdf";
  return (
    <footer className="completion">
      <a
        className={pdf ? "primary reader-link" : "secondary reader-link"}
        href={readerSourceUrl(c.source)}
        target="_blank"
        rel="noreferrer"
      >
        {pdf ? "Open in Reader to highlight" : "Open saved copy in Reader"}
      </a>
    </footer>
  );
}

interface ControllerProps {
  readonly controller: ExtensionCaptureController;
}
