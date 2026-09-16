import { useEffect } from "react";

import { InspectorContent } from "./InspectorPane.js";
import { useAnnotationDraftDirty } from "./use-annotation-draft.js";
import { useSourceToolsWorkspace } from "./use-reader-workspace.js";

import type { SourceWorkspaceTab } from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, Source, SourceId, SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export function WorkspaceToolTab({
  tab,
  source,
  gateway,
  reconcileSource,
  composer,
  onOpenAnnotation,
  onDirtyChange,
  onOpenSourceView,
}: {
  readonly tab: SourceWorkspaceTab;
  readonly source: SourceSummary;
  readonly gateway: ReaderWorkspaceGateway;
  readonly reconcileSource: (source: Source) => void;
  readonly composer: AnnotationComposerController;
  readonly onOpenAnnotation: (annotation: Annotation) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onOpenSourceView: (sourceId: SourceId, view: "document" | "citation") => void;
}): JSX.Element {
  const workspace = useSourceToolsWorkspace(gateway, tab.sourceId, reconcileSource);
  const noteDirty =
    tab.view === "note" &&
    workspace.saveStatus !== "saved" &&
    !workspace.draftRecovery?.locallySaved;
  const annotationDirty = useAnnotationDraftDirty(source.collectionId, source.id);
  const dirty =
    noteDirty ||
    (tab.view === "citation" && workspace.citation.dirty) ||
    (tab.view === "annotations" && annotationDirty);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  return (
    <div className="workspace-tool-surface is-session-bound">
      <InspectorContent
        tab={tab.view === "document" ? "annotations" : tab.view}
        workspace={workspace}
        composer={{ ...composer, open: onOpenAnnotation, editingAnnotationId: null }}
        gateway={gateway}
        onOpenSourceView={onOpenSourceView}
      />
    </div>
  );
}
