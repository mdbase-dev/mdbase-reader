import { ReaderButton } from "@mdbase-reader/ui";

import { MoreIcon } from "./icons.js";
import { draggedWorkspaceTab } from "./source-tab-drag.js";

import type { SourceWorkspacePane } from "./source-workspace-layout.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { CSSProperties, DragEvent, JSX, PointerEvent } from "react";

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
    if (!deck) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: globalThis.PointerEvent): void => {
      const rect = deck.getBoundingClientRect();
      const ratio = vertical
        ? (moveEvent.clientY - rect.top) / rect.height
        : (moveEvent.clientX - rect.left) / rect.width;
      workspace.resizeSplit(ratio);
    };
    const finish = (): void => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", finish);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", finish);
  };
  return (
    <button
      type="button"
      className="workspace-split-handle"
      aria-label="Resize reading panes"
      onPointerDown={startResize}
    >
      <span />
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
  onAddSource,
}: {
  readonly hasSources: boolean;
  readonly onAddSource: () => void;
}): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">{hasSources ? "No source selected" : "Working set is empty"}</span>
        <h2>{hasSources ? "Choose an open source." : "Open something worth returning to."}</h2>
        <p>Select a source in the library, or add a readable document.</p>
        <ReaderButton onClick={onAddSource}>Add a source</ReaderButton>
      </div>
    </div>
  );
}

function allowDrop(event: DragEvent): void {
  event.preventDefault();
}
