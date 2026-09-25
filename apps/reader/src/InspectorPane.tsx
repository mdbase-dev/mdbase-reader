import { useCallback, type JSX } from "react";

import { AnnotationEditingContext } from "./AnnotationEditingContext.js";
import { AnnotationList } from "./AnnotationList.js";
import { CitationEditor } from "./CitationEditor.js";
import { CitationIcon, HighlightIcon, NoteIcon, PanelIcon } from "./icons.js";
import { SourceNoteEditor } from "./SourceNoteEditor.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";

export type InspectorTab = "note" | "annotations" | "citation";

export interface InspectorPaneProps {
  readonly open: boolean;
  readonly tab: InspectorTab;
  readonly source: SourceSummary | null;
  readonly paneLabel: string;
  readonly workspace: ReaderSourceWorkspaceController;
  readonly composer: AnnotationComposerController;
  readonly gateway: ReaderWorkspaceGateway;
  readonly workbenchOwner?: {
    readonly tab: InspectorTab;
    readonly paneLabel: string;
    readonly onOpen: () => void;
  } | null;
  readonly onTabChange: (tab: InspectorTab) => void;
  readonly onPromote: (tab: InspectorTab) => void;
  readonly onOpenSourceView?: (sourceId: SourceId, view: "document" | "citation") => void;
}

export function InspectorPane({
  open,
  tab,
  source,
  paneLabel,
  workspace,
  composer,
  gateway,
  workbenchOwner,
  onTabChange,
  onPromote,
  onOpenSourceView,
}: InspectorPaneProps): JSX.Element {
  return (
    <aside
      id="reader-source-tools"
      className={open ? "inspector-pane" : "inspector-pane is-mobile-closed"}
      aria-label="Source workspace"
      aria-hidden={!open}
      inert={!open}
    >
      {/* The dock tab above names the source; this row only switches its tools. */}
      <div className="inspector-context">
        <span className="sr-only">
          {paneLabel}: {source?.title ?? "No source in this pane"}
        </span>
        <InspectorTabs
          tab={tab}
          enabled={source !== null}
          annotationCount={
            workspace.annotations.status === "ready" ? workspace.annotations.value.length : null
          }
          onChange={onTabChange}
        />
        <button
          type="button"
          className="icon-button inspector-promote"
          disabled={!source}
          aria-label={`Open ${tab} in workbench`}
          title="Keep open as a workbench tab"
          onClick={() => onPromote(tab)}
        >
          <PanelIcon />
        </button>
      </div>
      {source && workbenchOwner?.tab === tab ? (
        <div className="inspector-status inspector-workbench-owner">
          <strong>
            {tabLabel(tab)} is open in {workbenchOwner.paneLabel}
          </strong>
          <span>Reader keeps one writable editor for each source record.</span>
          <button type="button" onClick={workbenchOwner.onOpen}>
            Go to workbench
          </button>
        </div>
      ) : source ? (
        <InspectorContent
          tab={tab}
          workspace={workspace}
          composer={composer}
          gateway={gateway}
          {...(onOpenSourceView ? { onOpenSourceView } : {})}
        />
      ) : (
        <div className="inspector-status inspector-context-empty">
          <strong>Notes follow the active pane</strong>
          <span>Focus a document, note, annotation, or citation tab to inspect its source.</span>
        </div>
      )}
    </aside>
  );
}

function InspectorTabs({
  tab,
  enabled,
  annotationCount,
  onChange,
}: {
  readonly tab: InspectorTab;
  readonly enabled: boolean;
  readonly annotationCount: number | null;
  readonly onChange: (tab: InspectorTab) => void;
}): JSX.Element {
  return (
    <div className="inspector-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        disabled={!enabled}
        aria-selected={tab === "annotations"}
        onClick={() => onChange("annotations")}
      >
        <HighlightIcon /> Annotations <span>{annotationCount ?? "—"}</span>
      </button>
      <button
        type="button"
        role="tab"
        disabled={!enabled}
        aria-selected={tab === "note"}
        onClick={() => onChange("note")}
      >
        <NoteIcon /> Source note
      </button>
      <button
        type="button"
        role="tab"
        disabled={!enabled}
        aria-selected={tab === "citation"}
        onClick={() => onChange("citation")}
      >
        <CitationIcon /> Citation
      </button>
    </div>
  );
}

function tabLabel(tab: InspectorTab): string {
  return tab === "note" ? "Source note" : tab === "citation" ? "Citation" : "Annotations";
}

export function InspectorContent({
  tab,
  workspace,
  composer,
  gateway,
  onOpenSourceView,
}: Pick<
  InspectorPaneProps,
  "tab" | "workspace" | "composer" | "gateway" | "onOpenSourceView"
>): JSX.Element {
  const readFile = useCallback(
    (path: string, options?: Parameters<ReaderWorkspaceGateway["readFile"]>[2]) =>
      gateway.readFile(path, undefined, options),
    [gateway],
  );
  return tab === "annotations" ? (
    <div className="annotation-workspace">
      <AnnotationEditingContext value={gateway}>
        <AnnotationList
          key={
            workspace.sourceRecord.status === "ready" ? workspace.sourceRecord.value.id : "loading"
          }
          annotations={workspace.annotations}
          activeId={composer.activeAnnotationId}
          transclusion={workspace.transclusion}
          onUpdate={workspace.updateAnnotation}
          onPlanDelete={workspace.planAnnotationDeletion}
          onDelete={workspace.deleteAnnotation}
          onOpen={composer.open}
          editingId={composer.editingAnnotationId}
          onCancelEdit={composer.stopEditing}
          readFile={readFile}
        />
      </AnnotationEditingContext>
    </div>
  ) : tab === "note" ? (
    <div className="note-editor">
      <SourceNoteEditor
        workspace={workspace}
        composer={composer}
        gateway={gateway}
        {...(onOpenSourceView ? { onOpenSourceView } : {})}
      />
    </div>
  ) : (
    <CitationEditor workspace={workspace} />
  );
}
