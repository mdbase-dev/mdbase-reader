import { useState, type JSX, type ReactNode } from "react";

import { DocumentContextualToolbar } from "./DocumentContextualToolbar.js";
import { SourceTabStrip } from "./SourceTabStrip.js";
import {
  useProgressiveWorkspaceTabs,
  workspaceSessionKey,
} from "./use-progressive-workspace-tabs.js";
import {
  DocumentEmpty,
  EmptyWorkspace,
  PaneSplitTargets,
  SplitHandle,
  splitStyle,
} from "./WorkspacePaneSupport.js";

import type {
  SourceWorkspacePane,
  WorkspacePaneId,
  WorkspaceTab,
} from "./source-workspace-layout.js";
import type { WorkspaceSessionKey } from "./use-progressive-workspace-tabs.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";

export interface DocumentWorkspaceProps {
  readonly sources: readonly SourceSummary[];
  readonly sourceWorkspace: SourceWorkspaceController;
  readonly focusMode: boolean;
  readonly inspectorOpen: boolean;
  readonly readingResume: ReadingResumeState;
  readonly decorationProblem: string | null;
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  readonly sourceExport: SourceExportController;
  readonly renderDocument: (source: SourceSummary, paneId: WorkspacePaneId) => ReactNode;
  readonly renderTool: (tab: WorkspaceTab, focused: boolean) => ReactNode;
  readonly onAddSource: () => void;
  readonly onBackToLibrary: () => void;
  readonly onToggleFocus: () => void;
  readonly onToggleInspector: () => void;
  readonly onToggleAreaSelection: () => void;
}

export function DocumentWorkspace(props: DocumentWorkspaceProps): JSX.Element {
  const { sourceWorkspace } = props;
  const [dragging, setDragging] = useState(false);
  const hydratedTabs = useProgressiveWorkspaceTabs(sourceWorkspace.layout);
  return (
    <section
      className={`document-workspace is-${sourceWorkspace.layout.splitDirection ?? "single"}`}
      aria-label="Document reader"
      onDragEnter={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      onDrop={() => setDragging(false)}
    >
      <div className="workspace-pane-deck" style={splitStyle(sourceWorkspace)}>
        {sourceWorkspace.layout.panes.map((pane) => (
          <WorkspacePane
            key={pane.id}
            pane={pane}
            dragging={dragging}
            hydratedTabs={hydratedTabs}
            {...props}
          />
        ))}
        {sourceWorkspace.layout.panes.length === 2 ? (
          <SplitHandle workspace={sourceWorkspace} />
        ) : null}
      </div>
    </section>
  );
}

function WorkspacePane({
  pane,
  sources,
  sourceWorkspace,
  dragging,
  hydratedTabs,
  renderDocument,
  renderTool,
  ...toolbar
}: DocumentWorkspaceProps & {
  readonly pane: SourceWorkspacePane;
  readonly dragging: boolean;
  readonly hydratedTabs: ReadonlySet<WorkspaceSessionKey>;
}): JSX.Element {
  const active = pane.tabs.find(({ id }) => id === pane.activeTabId) ?? null;
  const sourceFor = (tab: WorkspaceTab): SourceSummary | null =>
    sources.find(({ id }) => id === tab.sourceId) ?? null;
  const source = active ? sourceFor(active) : null;
  const focused = sourceWorkspace.layout.focusedPaneId === pane.id;
  return (
    <section
      className={`workspace-pane${focused ? " is-focused" : ""}`}
      aria-label={`Reading pane ${pane.id === "primary" ? "A" : "B"}`}
      onPointerDown={() => sourceWorkspace.focus(pane.id)}
    >
      <SourceTabStrip
        pane={pane}
        sourceFor={sourceFor}
        onActivate={(tab) => sourceWorkspace.activateTab(tab.id, pane.id)}
        onPromote={(tab) => sourceWorkspace.promote(tab.id, pane.id)}
        onPin={(tab, pinned) => sourceWorkspace.pin(tab.id, pane.id, pinned)}
        onClose={(tab) => sourceWorkspace.closeTab(tab.id, pane.id)}
        onCloseOthers={(tab) => sourceWorkspace.closeOthers(tab.id, pane.id)}
        onCloseToRight={(tab) => sourceWorkspace.closeToRight(tab.id, pane.id)}
        onOpenBeside={(tab, direction) =>
          sourceWorkspace.openBeside(tab.sourceId, tab.view, direction)
        }
        onReorder={(from, to) => sourceWorkspace.reorder(pane.id, from, to)}
        onMoveFromPane={(tabId, fromPaneId) => sourceWorkspace.moveTab(tabId, fromPaneId, pane.id)}
      />
      {active && source ? (
        <>
          <DocumentContextualToolbar
            source={source}
            pane={pane}
            workspace={sourceWorkspace}
            {...toolbar}
          />
          <div
            className="document-canvas"
            onPointerDownCapture={() => {
              if (active.preview) {
                sourceWorkspace.promote(active.id, pane.id);
              }
            }}
          >
            <WorkspaceSessions
              pane={pane}
              sources={sources}
              renderDocument={renderDocument}
              renderTool={renderTool}
              focused={focused}
              hydratedTabs={hydratedTabs}
              onAddSource={toolbar.onAddSource}
            />
          </div>
        </>
      ) : (
        <EmptyWorkspace hasSources={sources.length > 0} onAddSource={toolbar.onAddSource} />
      )}
      {dragging && sourceWorkspace.layout.panes.length === 1 ? (
        <PaneSplitTargets pane={pane} workspace={sourceWorkspace} />
      ) : null}
    </section>
  );
}

function WorkspaceSessions({
  pane,
  sources,
  renderDocument,
  renderTool,
  focused,
  hydratedTabs,
  onAddSource,
}: Pick<DocumentWorkspaceProps, "sources" | "renderDocument" | "renderTool" | "onAddSource"> & {
  readonly pane: SourceWorkspacePane;
  readonly focused: boolean;
  readonly hydratedTabs: ReadonlySet<WorkspaceSessionKey>;
}): JSX.Element {
  return (
    <div className="document-session-deck">
      {pane.tabs.map((tab) => {
        const source = sources.find(({ id }) => id === tab.sourceId);
        const active = tab.id === pane.activeTabId;
        const hydrated = active || hydratedTabs.has(workspaceSessionKey(pane.id, tab.id));
        return source ? (
          <div
            className={active ? "document-session is-active" : "document-session"}
            key={tab.id}
            aria-hidden={!active}
          >
            {hydrated
              ? tab.view === "document"
                ? (renderDocument(source, pane.id) ?? <DocumentEmpty onAddSource={onAddSource} />)
                : renderTool(tab, focused)
              : null}
          </div>
        ) : null;
      })}
    </div>
  );
}
