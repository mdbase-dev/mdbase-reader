import { t, t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Fragment, useEffect, useState } from "react";

import { readerSourceUrl } from "./capture-model.js";
import { CitationPanel } from "./CitationPanel.js";
import {
  collectionName,
  ConnectFirst,
  ConnectionPanel,
  ConnectionProblem,
} from "./ConnectionPanel.js";
import { useDiagnosticsShown } from "./diagnostics-setting.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";
import { ExtensionHeader } from "./ExtensionHeader.js";
import { HighlightFields } from "./HighlightFields.js";
import { NotePanel, useNoteAttention } from "./NotePanel.js";
import { PanelTabContent, PanelTabs, usePanelTab, type PanelTab } from "./PanelTabs.js";
import { PostPicker } from "./PostPicker.js";
import { awaitingConnection, SaveBar, saveReady } from "./SaveBar.js";
import { SavedHighlights } from "./SavedHighlights.js";
import { openSettings, useShortcuts } from "./shortcuts.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

export function CaptureApp({
  controller,
  initialTab,
}: ControllerProps & { readonly initialTab?: PanelTab }): React.JSX.Element {
  const { t } = useLingui();
  const [diagnostics] = useDiagnosticsShown();
  const [tab, setTab] = usePanelTab(controller, initialTab);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const collection = collectionName(controller);
  useEffect(() => {
    document.title = controller.source
      ? t`mdbase Reader — source saved`
      : t`mdbase Reader — capture`;
  }, [controller.source, t]);
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
  const noteAttention = useNoteAttention(controller.note.session);
  const highlightCount = controller.source
    ? controller.annotations.filter((annotation) => annotation.target?.quote).length
    : null;
  return (
    <main className="capture-shell">
      {/* As in Reader's inspector, the page, its collection and its save action stay put
          while the tabs below scroll. */}
      <div className="panel-head">
        <ExtensionHeader
          collectionId={
            controller.snapshot.status === "ready" ? controller.snapshot.collectionId : null
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
        {controller.readerPage ? (
          <section className="page-card">
            <h1>
              <Trans>This is mdbase Reader</Trans>
            </h1>
            <p>
              <Trans>Nothing to save here</Trans>
            </p>
          </section>
        ) : unreadable(controller) ? (
          <section className="page-card">
            <h1>
              <Trans>Reader cannot read this page</Trans>
            </h1>
            <p>
              <Trans>Nothing to save here</Trans>
            </p>
          </section>
        ) : (
          <section className="page-card">
            <h1>{pageTitle(controller)}</h1>
            <p>
              {controller.capture
                ? `${new URL(controller.capture.canonicalUrl).hostname}${controller.capture.kind === "pdf" ? translate({ message: " · PDF" }) : ""}`
                : translate({ message: "Waiting for the active tab" })}
            </p>
            <PageStatus controller={controller} />
            <SaveBar controller={controller} />
          </section>
        )}
      </div>
      <div className="panel-body">
        <ConnectionPanel
          controller={controller}
          compact
          expanded={collectionOpen}
          onDone={() => setCollectionOpen(false)}
        />
        {unreadable(controller) ? <UnreadablePage controller={controller} /> : null}
        <PostPicker controller={controller} />
        <ConnectionProblem controller={controller} />
        {controller.capture && !unreadable(controller) ? (
          <>
            <PanelTabs
              tab={tab}
              highlightCount={highlightCount}
              noteAttention={noteAttention}
              onChange={setTab}
            />
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
      </div>
    </main>
  );
}

/**
 * The passage selected on the page, then the page's saved highlights. Without a selection
 * one quiet line says how to make one, and only while there is nothing saved to show.
 */
function HighlightsPanel({ controller: c }: ControllerProps): React.JSX.Element {
  useLocale();
  const selection = c.capture?.kind === "html" ? c.capture.selection : null;
  const saved = c.annotations.some((annotation) => annotation.target?.quote);
  return (
    <>
      {c.capture?.kind === "pdf" ? (
        <p className="tab-hint">
          <Trans>
            Chrome’s PDF viewer does not share selections, so PDFs are highlighted in Reader.
          </Trans>{" "}
          {c.source ? (
            <Trans>Highlights made there appear here.</Trans>
          ) : (
            <Trans>Save the PDF, then open it there.</Trans>
          )}
        </p>
      ) : awaitingConnection(c) ? (
        <ConnectFirst
          controller={c}
          purpose={
            selection
              ? translate({ message: "highlight the selected passage" })
              : translate({ message: "highlight this page" })
          }
        />
      ) : selection ? (
        <fieldset
          className="tab-section"
          data-capture-draft
          disabled={c.status === "saving" || c.navigated}
        >
          <HighlightFields controller={c} ready={saveReady(c)} />
        </fieldset>
      ) : saved ? null : (
        <HighlightHint colors={c.highlight.colors.length} />
      )}
      <SavedHighlights controller={c} />
    </>
  );
}

/** The title the source has, or will be saved with: the Literature note tab's title, not the browser tab's. */
function pageTitle(c: ExtensionCaptureController): string {
  if (c.source) {
    return c.source.title;
  }
  return c.capture ? c.draft.title.trim() || c.capture.pageTitle : t`Reading the page…`;
}

/**
 * The tab shows a page Reader cannot read: one it never could, or one the tab moved to
 * that following could not read.
 */
function unreadable(c: ExtensionCaptureController): boolean {
  return (c.navigated && !c.following) || (!c.capture && c.problemKind === "page");
}

/** Before the first highlight: how to make one, and the keys that make it quick. */
function HighlightHint({ colors }: { readonly colors: number }): React.JSX.Element {
  const shortcut = useShortcuts()?.find((value) => value.name === "save-highlight")?.keys;
  return (
    <div className="tab-hint">
      <p>
        <Trans>Select text on the page to highlight it.</Trans>
      </p>
      <ul className="hint-keys">
        <li>
          <kbd>1</kbd>
          {colors > 1 ? (
            <>
              –<kbd>{colors}</kbd>
            </>
          ) : null}{" "}
          <Trans>highlight the selection in that colour at once; </Trans>
          <kbd>
            <Trans context="Reader interface">Esc</Trans>
          </kbd>{" "}
          <Trans>clears it</Trans>
        </li>
        {shortcut ? (
          <li>
            <Trans>
              <kbd>{shortcut}</kbd> highlights the selection from the page
            </Trans>
          </li>
        ) : null}
        <li>
          <Trans>Right-click a selection to highlight it with a comment</Trans>
        </li>
      </ul>
    </div>
  );
}

/**
 * The tab shows a page Reader cannot read: a browser page, the Chrome Web Store, plain
 * HTTP, or any page while site access is limited. An ordinary state, so it is said quietly,
 * with the one thing that helps.
 */
function UnreadablePage({ controller: c }: ControllerProps): React.JSX.Element {
  // Text typed for a page read earlier in this tab is still there when it comes back.
  const moved = c.navigated && !c.following && c.capture !== null;
  return (
    <section className="page-note" role="status">
      <p>
        <Trans>
          Press the mdbase Reader toolbar button (Alt+Shift+S) to use Reader on this page. Browser
          pages and the Chrome Web Store cannot be read by extensions.
        </Trans>
      </p>
      {moved ? (
        <p>
          <Trans>Your unsaved text for the previous page is kept for this browser session.</Trans>
        </p>
      ) : null}
      {c.siteAccess === false ? (
        <>
          <p>
            <Trans>Site access is limited in Chrome, so Reader cannot follow your tabs.</Trans>
          </p>
          <button
            type="button"
            className="secondary compact"
            onClick={() => void c.allowAllSites()}
          >
            <Trans>Allow on all sites</Trans>
          </button>
        </>
      ) : null}
    </section>
  );
}

/**
 * The page's one status line, under its title: what is happening, or else whether it is
 * saved, with the way into Reader and Undo for a highlight just made. A problem says what
 * happened itself, below the card, so the line then keeps only its actions. Says nothing
 * while the panel is simply waiting.
 */
function PageStatus({ controller: c }: ControllerProps): React.JSX.Element {
  const message = c.problem ? null : statusMessage(c);
  // A saved PDF's next step is the Save bar's own Open in Reader to highlight.
  const link = c.source && c.capture?.kind !== "pdf" ? readerSourceUrl(c.source) : null;
  const parts = [
    message ? <span key="message">{message}</span> : null,
    link ? (
      <a key="link" href={link} target="_blank" rel="noreferrer">
        <Trans>Open in Reader</Trans>
      </a>
    ) : null,
    c.undoable && !c.busy ? (
      <button
        key="undo"
        type="button"
        className="inline-link"
        onClick={() => void c.undoHighlight()}
      >
        <Trans context="Reader interface">Undo</Trans>
      </button>
    ) : null,
  ].filter((part) => part !== null);
  return (
    // The live region stays mounted so screen readers announce what appears in it.
    <p className="page-status" role="status" aria-live="polite">
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index ? " · " : null}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

function statusMessage(c: ExtensionCaptureController): string | null {
  if (c.navigated && c.following) {
    return t`Opening the new page…`;
  }
  const progress = importProgressMessage(c.busy ? c.progress : null);
  if (progress) {
    return progress;
  }
  if (c.status === "saving") {
    return t`Saving…`;
  }
  if (c.notice) {
    return c.notice;
  }
  if (c.source) {
    return c.status === "saved" ? "Saved" : translate({ message: "In your collection" });
  }
  if (c.saveAttempted && !c.busy) {
    return translate({
      message:
        "We couldn’t confirm this saved. Saving again checks first, so nothing is saved twice.",
    });
  }
  return c.draftRestored ? t`Restored your unsaved note from earlier.` : null;
}

function importProgressMessage(p: ExtensionCaptureController["progress"]): string | null {
  switch (p?.phase) {
    case "uploading": {
      const percent = String(
        p.totalBytes ? Math.round((p.completedBytes / p.totalBytes) * 100) : 0,
      );
      return p.fileCount > 1
        ? translate`Uploading file ${p.fileIndex} of ${p.fileCount} · ${percent}%`
        : translate`Uploading the page · ${percent}%`;
    }
    case "recovering":
      return translate({ message: "Checking what the last attempt saved…" });
    case "creating":
      return translate({ message: "Saving the page…" });
    case "checking":
      return translate({ message: "Checking whether it’s already saved…" });
    default:
      return null;
  }
}

interface ControllerProps {
  readonly controller: ExtensionCaptureController;
}
