import { ReaderButton } from "@mdbase-reader/ui";

import { MergeIcon, MoreIcon } from "./icons.js";
import { draggedWorkspaceTab } from "./source-tab-drag.js";

import type { SourceWorkspacePane } from "./source-workspace-layout.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { CSSProperties, DragEvent, JSX, KeyboardEvent, PointerEvent } from "react";

export function PaneSplitTargets({
  pane,
  workspace,
}: {
  readonly pane: SourceWorkspacePane;
  readonly workspace: SourceWorkspaceController;
}): JSX.Element {
  const split = (event: DragEvent, direction: "horizontal" | "vertical"): void => {
    event.preventDefault();
    const dragged = draggedWorkspaceTab(event.dataTransfer);
    if (dragged?.paneId === pane.id) {
      workspace.splitTab(dragged.tabId, pane.id, direction);
    }
  };
  return (
    <div className="pane-split-targets" aria-hidden="true">
      <div
        className="split-target is-right"
        onDragOver={allowDrop}
        onDrop={(event) => split(event, "horizontal")}
      >
        Split right
      </div>
      <div
        className="split-target is-bottom"
        onDragOver={allowDrop}
        onDrop={(event) => split(event, "vertical")}
      >
        Split below
      </div>
    </div>
  );
}

export function SplitHandle({
  workspace,
}: {
  readonly workspace: SourceWorkspaceController;
}): JSX.Element {
  const vertical = workspace.layout.splitDirection === "vertical";
  const startResize = (event: PointerEvent<HTMLButtonElement>): void => {
    const deck = event.currentTarget.parentElement;
    const handle = event.currentTarget;
    if (!deck) {
      return;
    }
    handle.setPointerCapture(event.pointerId);
    let closingPane: "primary" | "secondary" | null = null;
    const move = (moveEvent: globalThis.PointerEvent): void => {
      const rect = deck.getBoundingClientRect();
      const ratio = vertical
        ? (moveEvent.clientY - rect.top) / rect.height
        : (moveEvent.clientX - rect.left) / rect.width;
      closingPane = ratio < 0.08 ? "primary" : ratio > 0.92 ? "secondary" : null;
      handle.dataset["closingPane"] = closingPane ?? "";
      workspace.resizeSplit(ratio);
    };
    const finish = (): void => {
      delete handle.dataset["closingPane"];
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", finish);
      globalThis.removeEventListener("pointercancel", finish);
      if (closingPane) {
        workspace.closePane(closingPane);
      }
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", finish);
    globalThis.addEventListener("pointercancel", finish);
  };
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const decrement = vertical ? event.key === "ArrowUp" : event.key === "ArrowLeft";
    const increment = vertical ? event.key === "ArrowDown" : event.key === "ArrowRight";
    if (event.key === "Home") {
      event.preventDefault();
      workspace.resizeSplit(0.5);
    } else if (decrement || increment) {
      event.preventDefault();
      workspace.resizeSplit(workspace.layout.splitRatio + (decrement ? -0.05 : 0.05));
    }
  };
  return (
    <button
      type="button"
      className="workspace-split-handle"
      aria-label="Resize reading panes"
      title="Resize panes · Double-click to reset · Drag to an edge to close"
      onPointerDown={startResize}
      onDoubleClick={() => workspace.resizeSplit(0.5)}
      onKeyDown={resizeWithKeyboard}
    >
      <span>
        <MergeIcon />
      </span>
    </button>
  );
}

export function splitStyle(workspace: SourceWorkspaceController): CSSProperties {
  if (workspace.layout.panes.length < 2) {
    return {};
  }
  const first = `${String(workspace.layout.splitRatio * 100)}%`;
  const second = `${String((1 - workspace.layout.splitRatio) * 100)}%`;
  const splitVariable = { "--workspace-split": first } as CSSProperties;
  return workspace.layout.splitDirection === "vertical"
    ? {
        ...splitVariable,
        gridTemplateRows: `${first} ${second}`,
        gridTemplateColumns: "minmax(0, 1fr)",
      }
    : {
        ...splitVariable,
        gridTemplateColumns: `${first} ${second}`,
        gridTemplateRows: "minmax(0, 1fr)",
      };
}

export function SourceActions({
  sourceExport,
}: {
  readonly sourceExport: SourceExportController;
}): JSX.Element {
  return (
    <details className="source-actions">
      <summary className="icon-button" aria-label="Source actions">
        <MoreIcon />
      </summary>
      <div className="source-actions-menu">
        <button
          type="button"
          disabled={!sourceExport.available || sourceExport.status === "exporting"}
          onClick={sourceExport.run}
        >
          <span>{sourceExport.status === "exporting" ? "Preparing export…" : "Export source"}</span>
          <small>Records, note, citations, and originals</small>
        </button>
        {sourceExport.message ? (
          <p className={`source-export-message is-${sourceExport.status}`}>
            {sourceExport.message}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function DocumentStatus({
  reading,
  decorationProblem,
}: {
  readonly reading: ReadingResumeState;
  readonly decorationProblem: string | null;
}): JSX.Element {
  if (decorationProblem) {
    return (
      <span className="reading-position-status is-error" title={decorationProblem}>
        Highlights unavailable
      </span>
    );
  }
  if (reading.status === "idle") {
    return <span className="reading-position-status" />;
  }
  const label =
    reading.status === "saving"
      ? "Saving position…"
      : reading.status === "saved"
        ? "Position saved"
        : (reading.message ?? "Position not saved");
  return (
    <span className={`reading-position-status is-${reading.status}`} title={label}>
      {reading.status === "error" ? "Position not saved" : label}
    </span>
  );
}

export function DocumentEmpty({ onAddSource }: { readonly onAddSource: () => void }): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">No readable representation</span>
        <h2>Add a PDF, EPUB, or saved web page.</h2>
        <p>The literature note remains available in the source workspace.</p>
        <ReaderButton onClick={onAddSource}>Add another source</ReaderButton>
      </div>
    </div>
  );
}

export function EmptyWorkspace({
  hasSources,
  split = false,
  paneLabel,
  onAddSource,
  onOpenLibrary,
  onClosePane,
}: {
  readonly hasSources: boolean;
  readonly split?: boolean;
  readonly paneLabel?: string;
  readonly onAddSource: () => void;
  readonly onOpenLibrary?: () => void;
  readonly onClosePane?: () => void;
}): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">
          {split && paneLabel
            ? `Pane ${paneLabel} is empty`
            : hasSources
              ? "No source selected"
              : "Working set is empty"}
        </span>
        <h2>{hasSources ? "Open something here." : "Open something worth returning to."}</h2>
        <p>
          Select a source in the library, open the library here, or close this workspace region.
        </p>
        <div className="document-empty-actions">
          {onOpenLibrary ? (
            <ReaderButton onClick={onOpenLibrary}>Open library here</ReaderButton>
          ) : null}
          <ReaderButton onClick={onAddSource}>Add a source</ReaderButton>
          {split && onClosePane ? (
            <button type="button" className="document-empty-close-pane" onClick={onClosePane}>
              Close pane
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function allowDrop(event: DragEvent): void {
  event.preventDefault();
}
