import { useCallback, useRef, type JSX, type ReactNode } from "react";

import { AnnotationComposerLayer } from "./AnnotationComposerLayer.js";
import { DocumentContextualToolbar } from "./DocumentContextualToolbar.js";
import { SelectionToolbarLayer } from "./SelectionToolbar.js";
import { useDocumentAnnotationDirty } from "./use-annotation-draft.js";
import { useDockPanelFocus } from "./use-dock-panel-focus.js";
import { workspaceSessionKey } from "./use-progressive-workspace-tabs.js";
import { DocumentEmpty } from "./WorkspacePaneSupport.js";

import type {
  LibraryWorkspaceTab,
  SourceWorkspacePane,
  SourceWorkspaceTab,
  WorkspacePaneId,
  WorkspaceTab,
} from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { DocumentAttachmentController } from "./use-document-attachment.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

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
  /** Attaches a document to a source that has none; absent when the collection cannot. */
  readonly documentAttachment?: DocumentAttachmentController | null;
  readonly onToggleFocus: () => void;
  readonly surfaces: ReadonlyMap<string, ReadingSurface>;
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
  const focused = props.sourceWorkspace.activePane.activeTabId === tab.id;
  const source = tab.kind === "source" ? props.sources.find(({ id }) => id === tab.sourceId) : null;
  const resident = visible || hydrated.has(workspaceSessionKey(paneId, tab.id));
  const document = tab.view === "document";
  useDocumentAnnotationDirty(dock, tab, source);
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
        <div className="document-session-deck">
          <div className={visible ? "document-session is-active" : "document-session"}>
            {resident ? sessionContent(props, tab, paneId, focused, visible) : null}
          </div>
        </div>
        {document && focused && visible ? (
          <>
            <AnnotationComposerLayer composer={props.annotationComposer} />
            {/* A phone shows selection actions in its bottom bar instead. */}
            {dock.mobile ? null : <SelectionToolbarLayer composer={props.annotationComposer} />}
          </>
        ) : null}
      </div>
    </section>
  );
}

/**
 * A document's actions. They sit with its tabs (or in a phone's header) rather than over the
 * page, so they never cover the text.
 */
export function DocumentToolbar({
  props,
  source,
  pane,
  tabId,
  focused,
}: {
  readonly props: DocumentWorkspaceProps;
  readonly source: SourceSummary;
  readonly pane: SourceWorkspacePane;
  readonly tabId: string;
  readonly focused: boolean;
}): JSX.Element {
  // Area selection and bookmarks act on the focused surface, so only its toolbar offers them.
  const composer = props.annotationComposer;
  return (
    <DocumentContextualToolbar
      source={source}
      pane={pane}
      workspace={props.sourceWorkspace}
      focusMode={props.focusMode}
      readingResume={props.readingResume}
      decorationProblem={props.decorationProblem}
      canSelectArea={focused && composer.canSelectArea}
      selectingArea={composer.selectingArea}
      canSelectText={focused && composer.canSelectText}
      selectingText={composer.selectingText}
      onToggleTextSelection={composer.toggleTextSelection}
      onToggleAreaSelection={composer.toggleAreaSelection}
      canBookmark={focused && composer.canBookmark}
      bookmarking={composer.bookmarking}
      onBookmark={composer.bookmark}
      sourceExport={props.sourceExport}
      onToggleFocus={props.onToggleFocus}
      surfaces={props.surfaces}
      sessionId={tabId}
    />
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
  const openNote = (): void => props.sourceWorkspace.openView(source.id, "note", paneId);
  if (source.documents.length === 0) {
    return (
      <DocumentEmpty
        onOpenNote={openNote}
        source={source}
        attachment={props.documentAttachment ?? null}
      />
    );
  }
  return props.renderDocument(source, paneId, tab.id) ?? <DocumentEmpty onOpenNote={openNote} />;
}
