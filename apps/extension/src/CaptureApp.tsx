import { useEffect } from "react";

import { CitationPanel } from "./CitationPanel.js";
import { ConnectionPanel, ConnectionProblem } from "./ConnectionPanel.js";
import { useDiagnosticsShown } from "./diagnostics-setting.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";
import { ExtensionHeader } from "./ExtensionHeader.js";
import { HighlightFields } from "./HighlightFields.js";
import { NotePanel } from "./NotePanel.js";
import { PanelTabContent, PanelTabs, usePanelTab, type PanelTab } from "./PanelTabs.js";
import { SaveBar, saveReady } from "./SaveBar.js";
import { SavedHighlights } from "./SavedHighlights.js";
import { openSettings } from "./shortcuts.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

export function CaptureApp({
  controller,
  initialTab,
}: ControllerProps & { readonly initialTab?: PanelTab }): React.JSX.Element {
  const [diagnostics] = useDiagnosticsShown();
  const [tab, setTab] = usePanelTab(controller, initialTab);
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
  const highlightCount = controller.source
    ? controller.annotations.filter((annotation) => annotation.target?.quote).length
    : null;
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
        <h1>{controller.source?.title ?? controller.capture?.pageTitle ?? "Reading the page…"}</h1>
        <p>
          {controller.capture
            ? new URL(controller.capture.canonicalUrl).hostname
            : "Waiting for the active tab"}
        </p>
        <SaveBar controller={controller} />
      </section>
      <Navigated controller={controller} />
      <ConnectionPanel controller={controller} compact />
      <PanelStatus controller={controller} />
      {controller.capture ? (
        <>
          <PanelTabs tab={tab} highlightCount={highlightCount} onChange={setTab} />
          <PanelTabContent tab={tab}>
            {tab === "highlights" ? (
              <HighlightsPanel controller={controller} />
            ) : tab === "note" ? (
              <NotePanel controller={controller} />
            ) : (
              <CitationPanel controller={controller} />
            )}
          </PanelTabContent>
        </>
      ) : null}
      <footer className="panel-footer">
        <button type="button" className="text-button" onClick={openSettings}>
          Settings and shortcuts
        </button>
        {diagnostics ? <DiagnosticsPanel /> : null}
      </footer>
    </main>
  );
}

/** The passage selected on the page, then the page's saved highlights. */
function HighlightsPanel({ controller: c }: ControllerProps): React.JSX.Element {
  return (
    <>
      <fieldset
        className="tab-section"
        data-capture-draft
        disabled={c.status === "saving" || c.navigated}
      >
        <HighlightFields controller={c} ready={saveReady(c)} />
      </fieldset>
      <SavedHighlights controller={c} />
    </>
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

interface ControllerProps {
  readonly controller: ExtensionCaptureController;
}
