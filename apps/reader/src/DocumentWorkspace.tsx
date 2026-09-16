import { useCallback, useRef, type JSX, type ReactNode } from "react";

import { AnnotationComposer } from "./AnnotationComposer.js";
import { DocumentContextualToolbar } from "./DocumentContextualToolbar.js";
import { useDockPanelFocus } from "./use-dock-panel-focus.js";
import { workspaceSessionKey } from "./use-progressive-workspace-tabs.js";
import { DocumentEmpty } from "./WorkspacePaneSupport.js";

import type {
  LibraryWorkspaceTab,
  SourceWorkspaceTab,
  WorkspacePaneId,
  WorkspaceTab,
} from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
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
  readonly annotationComposer: AnnotationComposerController;
  readonly sourceExport: SourceExportController;
  readonly renderDocument: (
    source: SourceSummary,
    paneId: WorkspacePaneId,
    sessionId: string,
  ) => ReactNode;
  readonly renderTool: (
    tab: SourceWorkspaceTab,
    paneId: WorkspacePaneId,
    focused: boolean,
  ) => ReactNode;
  readonly renderLibrary: (tab: LibraryWorkspaceTab, focused: boolean) => ReactNode;
  readonly onAddSource: () => void;
  readonly onToggleFocus: () => void;
}

/** One stable Dockview panel. Moving it never changes its React/session identity. */
export function DocumentWorkspace({
  props,
  tab,
  paneId,
  visible,
  hydrated,
}: {
  readonly props: DocumentWorkspaceProps;
  readonly tab: WorkspaceTab;
  readonly paneId: string;
  readonly visible: boolean;
  readonly hydrated: ReadonlySet<string>;
}): JSX.Element {
  const host = useRef<HTMLElement>(null);
  const dock = props.sourceWorkspace.dock;
  const activate = useCallback(() => {
    dock.activate(tab.id);
    dock.patch(tab.id, { preview: false });
  }, [dock, tab.id]);
  useDockPanelFocus(host, activate);
  const pane = props.sourceWorkspace.layout.panes.find(({ id }) => id === paneId);
  const focused = props.sourceWorkspace.activePane.activeTabId === tab.id;
  const source = tab.kind === "source" ? props.sources.find(({ id }) => id === tab.sourceId) : null;
  const resident = visible || hydrated.has(workspaceSessionKey(paneId, tab.id));
  const document = tab.view === "document";
  const surfaceClass = workspaceSurfaceClass(tab);
  return (
    <section
      ref={host}
      className={`workspace-pane${focused ? " is-focused" : ""} ${surfaceClass}-pane`}
      data-session-id={tab.id}
      aria-label={source?.title ?? "Library workspace"}
      aria-hidden={!visible}
      inert={!visible}
    >
      <div className={`document-canvas ${surfaceClass}-canvas`}>
        {document && source && pane ? (
          <DocumentContextualToolbar
            source={source}
            pane={pane}
            workspace={props.sourceWorkspace}
            focusMode={props.focusMode}
            readingResume={props.readingResume}
            decorationProblem={props.decorationProblem}
            canSelectArea={focused && props.annotationComposer.canSelectArea}
            selectingArea={props.annotationComposer.selectingArea}
            onToggleAreaSelection={props.annotationComposer.toggleAreaSelection}
            sourceExport={props.sourceExport}
            onToggleFocus={props.onToggleFocus}
          />
        ) : null}
        <div className="document-session-deck">
          <div className={visible ? "document-session is-active" : "document-session"}>
            {resident ? sessionContent(props, tab, paneId, focused, visible) : null}
          </div>
        </div>
        {document && focused && visible ? (
          <div className="document-annotation-composer">
            <AnnotationComposer composer={props.annotationComposer} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function workspaceSurfaceClass(tab: WorkspaceTab): string {
  if (tab.kind === "library") {
    return "is-library";
  }
  return tab.view === "document" ? "is-document" : "is-tool";
}

function sessionContent(
  props: DocumentWorkspaceProps,
  tab: WorkspaceTab,
  paneId: string,
  focused: boolean,
  visible: boolean,
): ReactNode {
  if (tab.kind === "library") {
    return props.renderLibrary(tab, focused && visible);
  }
  const source = props.sources.find(({ id }) => id === tab.sourceId);
  if (!source) {
    return <p className="inspector-status">This source is no longer available.</p>;
  }
  if (tab.view !== "document") {
    return props.renderTool(tab, paneId, focused);
  }
  return (
    props.renderDocument(source, paneId, tab.id) ?? (
      <DocumentEmpty onAddSource={props.onAddSource} />
    )
  );
}
