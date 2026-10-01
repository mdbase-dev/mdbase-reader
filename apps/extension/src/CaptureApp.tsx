import { useEffect, useState } from "react";

import { CitationPanel } from "./CitationPanel.js";
import { collectionName, ConnectionPanel, ConnectionProblem } from "./ConnectionPanel.js";
import { useDiagnosticsShown } from "./diagnostics-setting.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";
import { ExtensionHeader } from "./ExtensionHeader.js";
import { HighlightFields } from "./HighlightFields.js";
import { NotePanel } from "./NotePanel.js";
import { PanelTabContent, PanelTabs, usePanelTab, type PanelTab } from "./PanelTabs.js";
import { SaveBar, saveReady } from "./SaveBar.js";
import { SavedHighlights } from "./SavedHighlights.js";
import { openSettings, useShortcuts } from "./shortcuts.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

export function CaptureApp({
  controller,
  initialTab,
}: ControllerProps & { readonly initialTab?: PanelTab }): React.JSX.Element {
  const [diagnostics] = useDiagnosticsShown();
  const [tab, setTab] = usePanelTab(controller, initialTab);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const collection = collectionName(controller);
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
        collection={
          collection
            ? {
                name: collection,
                expanded: collectionOpen,
                onToggle: () => setCollectionOpen((open) => !open),
              }
            : null
        }
        onSettings={openSettings}
      />
      <ConnectionPanel
        controller={controller}
        compact
        expanded={collectionOpen}
        onDone={() => setCollectionOpen(false)}
      />
      <section className="page-card">
        <h1>{pageTitle(controller)}</h1>
        <p>
          {controller.capture
            ? `${new URL(controller.capture.canonicalUrl).hostname}${controller.capture.kind === "pdf" ? " · PDF" : ""}`
            : "Waiting for the active tab"}
        </p>
        <SaveBar controller={controller} />
      </section>
      <Navigated controller={controller} />
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
      {diagnostics ? (
        <footer className="panel-footer">
          <DiagnosticsPanel />
        </footer>
      ) : null}
    </main>
  );
}

/**
 * The passage selected on the page, then the page's saved highlights. Without a selection
 * one quiet line says how to make one, and only while there is nothing saved to show.
 */
function HighlightsPanel({ controller: c }: ControllerProps): React.JSX.Element {
  const selection = c.capture?.kind === "html" ? c.capture.selection : null;
  const saved = c.annotations.some((annotation) => annotation.target?.quote);
  return (
    <>
      {c.capture?.kind === "pdf" ? (
        <p className="tab-hint">
          Chrome’s PDF viewer does not share selections, so PDFs are highlighted in Reader.
          {c.source ? " Highlights made there appear here." : " Save the PDF, then open it there."}
        </p>
      ) : selection ? (
        <fieldset
          className="tab-section"
          data-capture-draft
          disabled={c.status === "saving" || c.navigated}
        >
          <HighlightFields controller={c} ready={saveReady(c)} />
        </fieldset>
      ) : saved ? null : (
        <HighlightHint />
      )}
      <SavedHighlights controller={c} />
    </>
  );
}

/** The title the source has, or will be saved with: the Note tab's title, not the tab's. */
function pageTitle(c: ExtensionCaptureController): string {
  if (c.source) {
    return c.source.title;
  }
  return c.capture ? c.draft.title.trim() || c.capture.pageTitle : "Reading the page…";
}

/** Before the first highlight: how to make one, and the keys that make it quick. */
function HighlightHint(): React.JSX.Element {
  const shortcut = useShortcuts()?.find((value) => value.name === "save-highlight")?.keys;
  return (
    <div className="tab-hint">
      <p>Select text on the page to highlight it.</p>
      <ul className="hint-keys">
        <li>
          <kbd>1</kbd>–<kbd>5</kbd> save the selection in a colour; <kbd>Esc</kbd> clears it
        </li>
        {shortcut ? (
          <li>
            <kbd>{shortcut}</kbd> highlights the selection from the page
          </li>
        ) : null}
        <li>Right-click a selection to highlight it with a comment</li>
      </ul>
    </div>
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
      {c.followHost ? (
        <div className="problem-actions">
          <button type="button" onClick={() => void c.followSite()}>
            Follow this tab on {c.followHost}
          </button>
        </div>
      ) : null}
      <p>
        To follow it on every site, turn on Saved pages in{" "}
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
        {message ? (
          <p>
            {message}
            {c.undoable && !c.busy ? (
              <>
                {" "}
                <button
                  type="button"
                  className="inline-link"
                  onClick={() => void c.undoHighlight()}
                >
                  Undo
                </button>
              </>
            ) : null}
          </p>
        ) : null}
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
