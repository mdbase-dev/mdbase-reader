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
  LibraryWorkspaceTab,
  SourceWorkspaceTab,
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
  readonly readingResume: ReadingResumeState;
  readonly decorationProblem: string | null;
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  readonly sourceExport: SourceExportController;
  readonly renderDocument: (source: SourceSummary, paneId: WorkspacePaneId) => ReactNode;
  readonly renderTool: (tab: SourceWorkspaceTab, focused: boolean) => ReactNode;
  readonly renderLibrary: (tab: LibraryWorkspaceTab, focused: boolean) => ReactNode;
  readonly onAddSource: () => void;
  readonly onBackToLibrary: () => void;
  readonly onToggleFocus: () => void;
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

// The branching mirrors the three distinct workspace surfaces: library, tools, and documents.
// eslint-disable-next-line complexity
function WorkspacePane({
  pane,
  sources,
  sourceWorkspace,
  dragging,
  hydratedTabs,
  renderDocument,
  renderTool,
  renderLibrary,
  ...toolbar
}: DocumentWorkspaceProps & {
  readonly pane: SourceWorkspacePane;
  readonly dragging: boolean;
  readonly hydratedTabs: ReadonlySet<WorkspaceSessionKey>;
}): JSX.Element {
  const active = pane.tabs.find(({ id }) => id === pane.activeTabId) ?? null;
  const sourceFor = (tab: WorkspaceTab): SourceSummary | null =>
    tab.kind === "source" ? (sources.find(({ id }) => id === tab.sourceId) ?? null) : null;
  const source = active ? sourceFor(active) : null;
  const focused = sourceWorkspace.layout.focusedPaneId === pane.id;
  const surfaceClass =
    active?.kind === "library"
      ? " is-library-pane"
      : active?.kind === "source" && active.view !== "document"
        ? " is-tool-pane"
        : "";
  return (
    <section
      className={`workspace-pane${focused ? " is-focused" : ""}${surfaceClass}`}
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
          tab.kind === "source"
            ? sourceWorkspace.openBeside(tab.sourceId, tab.view, direction)
            : sourceWorkspace.openLibraryBeside(tab.libraryViewId, tab.title, direction)
        }
        onReorder={(from, to) => sourceWorkspace.reorder(pane.id, from, to)}
        onMoveFromPane={(tabId, fromPaneId) => sourceWorkspace.moveTab(tabId, fromPaneId, pane.id)}
      />
      {active?.kind === "library" ? (
        <div className="document-canvas is-library-canvas">
          <WorkspaceSessions
            pane={pane}
            sources={sources}
            renderDocument={renderDocument}
            renderTool={renderTool}
            renderLibrary={renderLibrary}
            focused={focused}
            hydratedTabs={hydratedTabs}
            onAddSource={toolbar.onAddSource}
          />
        </div>
      ) : active?.kind === "source" && active.view !== "document" && source ? (
        <div className="document-canvas is-tool-canvas">
          <WorkspaceSessions
            pane={pane}
            sources={sources}
            renderDocument={renderDocument}
            renderTool={renderTool}
            renderLibrary={renderLibrary}
            focused={focused}
            hydratedTabs={hydratedTabs}
            onAddSource={toolbar.onAddSource}
          />
        </div>
      ) : active && source ? (
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
              renderLibrary={renderLibrary}
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
  renderLibrary,
  focused,
  hydratedTabs,
  onAddSource,
}: Pick<
  DocumentWorkspaceProps,
  "sources" | "renderDocument" | "renderTool" | "renderLibrary" | "onAddSource"
> & {
  readonly pane: SourceWorkspacePane;
  readonly focused: boolean;
  readonly hydratedTabs: ReadonlySet<WorkspaceSessionKey>;
}): JSX.Element {
  return (
    <div className="document-session-deck">
      {pane.tabs.map((tab) => {
        const source =
          tab.kind === "source" ? sources.find(({ id }) => id === tab.sourceId) : undefined;
        const active = tab.id === pane.activeTabId;
        const hydrated = active || hydratedTabs.has(workspaceSessionKey(pane.id, tab.id));
        return tab.kind === "library" || source ? (
          <div
            className={active ? "document-session is-active" : "document-session"}
            key={tab.id}
            aria-hidden={!active}
          >
            {hydrated
              ? tab.kind === "library"
                ? renderLibrary(tab, focused)
                : tab.view === "document"
                  ? source
                    ? (renderDocument(source, pane.id) ?? (
                        <DocumentEmpty onAddSource={onAddSource} />
                      ))
                    : null
                  : renderTool(tab, focused)
              : null}
          </div>
        ) : null;
      })}
    </div>
  );
}
