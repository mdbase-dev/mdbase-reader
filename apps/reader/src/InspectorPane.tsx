import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useState, type JSX } from "react";

import { AnnotationEditingContext } from "./AnnotationEditingContext.js";
import { AnnotationList } from "./AnnotationList.js";
import { useAnnotationPanelActions } from "./AnnotationPanelActions.js";
import { preloadCitations } from "./citation-renderer.js";
import { requestConfirmation } from "./confirmation.js";
import { PanelIcon } from "./icons.js";
import { lazyFeature } from "./lazy-feature.js";
import { publishSharedAnnotation } from "./shared-annotation-resource.js";

import type { AnnotationFileReader } from "./AnnotationImage.js";
import type { NotesView } from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, HighlightColorKey, SourceId, SourceSummary } from "@mdbase-reader/core";

const CitationEditor = lazyFeature(
  async () => ({ default: (await import("./CitationEditor.js")).CitationEditor }),
  "the citation editor",
);
const SourceNoteEditor = lazyFeature(
  async () => ({ default: (await import("./SourceNoteEditor.js")).SourceNoteEditor }),
  "the source note editor",
);

export function preloadInspectorTools(): void {
  CitationEditor.preload();
  SourceNoteEditor.preload();
  preloadCitations();
}

export type InspectorTab = NotesView;

export interface InspectorPaneProps {
  /** Which of the source's tools this panel shows. */
  readonly tab: InspectorTab;
  /** Whether the panel is on screen: the active tab of its pane, in a region that is open. */
  readonly visible: boolean;
  readonly source: SourceSummary | null;
  readonly paneLabel: string;
  readonly workspace: ReaderSourceWorkspaceController;
  readonly composer: AnnotationComposerController;
  readonly gateway: ReaderWorkspaceGateway;
  /** The pane holding this source's own tab for the same tool, when that tab owns its editing. */
  readonly workbenchOwner?: {
    readonly paneLabel: string;
    readonly onOpen: () => void;
  } | null;
  readonly onPromote: () => void;
  readonly onOpenSourceView?: (sourceId: SourceId, view: "document" | "citation") => void;
}

/**
 * A Notes panel: the annotations, note or citation of whichever source the reader is working
 * on. Its tab names the tool, so the panel starts by naming the source.
 */
export function InspectorPane({
  tab,
  visible,
  source,
  paneLabel,
  workspace,
  composer,
  gateway,
  workbenchOwner,
  onPromote,
  onOpenSourceView,
}: InspectorPaneProps): JSX.Element | null {
  const { t } = useLingui();
  // A citation form keeps what has been typed into it while another tab is in front.
  const [opened, setOpened] = useState(visible);
  if (visible && !opened) {
    setOpened(true);
  }
  if (!visible && !(tab === "citation" && opened)) {
    return null;
  }
  return (
    <aside
      className="inspector-pane"
      aria-label={t({ message: "Source workspace", context: "InspectorPane interface" })}
    >
      <div className="inspector-context">
        <h2 className="inspector-source" title={source?.title}>
          <span className="sr-only">{paneLabel}: </span>
          {source?.title ?? t({ message: "No source in this pane" })}
        </h2>
        <button
          type="button"
          className="icon-button inspector-promote"
          disabled={!source}
          aria-label={t`Open ${tab} in workbench`}
          title={t({ message: "Keep open as a workbench tab" })}
          onClick={onPromote}
        >
          <PanelIcon />
        </button>
      </div>
      {source && workbenchOwner ? (
        <div className="inspector-status inspector-workbench-owner">
          <strong>
            <Trans>
              {tabLabel(tab)} is open in {workbenchOwner.paneLabel}.
            </Trans>
          </strong>
          <span>
            <Trans>Reader keeps one writable editor for each source record.</Trans>
          </span>
          <button type="button" onClick={workbenchOwner.onOpen}>
            <Trans>Go to workbench</Trans>
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
          <strong>
            <Trans>Notes follow the active pane</Trans>
          </strong>
          <span>
            <Trans>
              Focus a document, note, annotation, or citation tab to inspect its source.
            </Trans>
          </span>
        </div>
      )}
    </aside>
  );
}

function tabLabel(tab: InspectorTab): string {
  return tab === "note"
    ? translate({ message: "Source note" })
    : tab === "citation"
      ? translate({ message: "Citation", context: "InspectorPane status or action" })
      : translate({ message: "Annotations", context: "InspectorPane status or action" });
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
  const [citationOpened, setCitationOpened] = useState(tab === "citation");
  if (tab === "citation" && !citationOpened) {
    setCitationOpened(true);
  }
  return (
    <>
      {citationOpened ? (
        <div hidden={tab !== "citation"} className="inspector-citation-resident">
          <CitationEditor workspace={workspace} />
        </div>
      ) : null}
      {tab === "annotations" ? (
        <AnnotationsTab
          workspace={workspace}
          composer={composer}
          gateway={gateway}
          readFile={readFile}
        />
      ) : tab === "note" ? (
        <div className="note-editor">
          <SourceNoteEditor
            workspace={workspace}
            composer={composer}
            gateway={gateway}
            {...(onOpenSourceView ? { onOpenSourceView } : {})}
          />
        </div>
      ) : null}
    </>
  );
}

function AnnotationsTab({
  workspace,
  composer,
  gateway,
  readFile,
}: Pick<InspectorPaneProps, "workspace" | "composer" | "gateway"> & {
  readonly readFile: AnnotationFileReader;
}): JSX.Element {
  useLocale();
  const actions = useAnnotationPanelActions({ workspace, composer, gateway });
  const source = workspace.sourceRecord.status === "ready" ? workspace.sourceRecord.value : null;
  const view = workspace.annotationView;
  return (
    <div className="annotation-workspace">
      <AnnotationEditingContext value={gateway}>
        <AnnotationList
          key={source?.id ?? "loading"}
          annotations={workspace.annotations}
          currentSourceId={source?.id}
          addMenu={actions.addMenu}
          beforeList={
            <>
              {actions.composerPanel}
              {view?.problem ? (
                <p className="annotation-view-problem" role="status">
                  {view.problem}
                </p>
              ) : null}
            </>
          }
          wholeBook={
            source?.partOf && view
              ? { value: view.wholeBook, onChange: view.setWholeBook }
              : undefined
          }
          owners={view?.sources}
          onRecolor={recolorAnnotation(workspace.recolorAnnotation)}
          onMoveOwner={
            gateway.moveAnnotationOwner
              ? async (annotation, owner) => {
                  if (
                    !(await requestConfirmation({
                      title: translate`Move annotation to “${owner.title}”?`,
                      message:
                        "Its document target, selector, revision and note embeds will not change. The new source may not include this passage in its range.",
                      confirmLabel: translate({ message: "Move annotation to source" }),
                      cancelLabel: translate({ message: "Keep source" }),
                    }))
                  ) {
                    return;
                  }
                  const fullOwner = await gateway.source(owner.id);
                  if (!fullOwner) {
                    throw new Error(
                      translate({
                        message: "The chosen source no longer exists. Choose another source.",
                      }),
                    );
                  }
                  if (!gateway.moveAnnotationOwner) {
                    throw new Error(translate({ message: "Moving annotations is unavailable." }));
                  }
                  const updated = await gateway.moveAnnotationOwner(annotation, fullOwner);
                  publishSharedAnnotation(gateway, annotation, updated);
                }
              : undefined
          }
          activeId={composer.activeAnnotationId}
          readingId={composer.readingAnnotationId}
          transclusion={workspace.transclusion}
          onUpdate={workspace.updateAnnotation}
          onPlanDelete={workspace.planAnnotationDeletion}
          onDelete={workspace.deleteAnnotation}
          onOpen={composer.open}
          editingId={composer.editingAnnotationId}
          onCancelEdit={composer.stopEditing}
          // Undo would delete the comment about to be written.
          onBeginEdit={(annotation) => composer.withdrawUndo(annotation.id)}
          readFile={readFile}
        />
      </AnnotationEditingContext>
    </div>
  );
}

function recolorAnnotation(
  recolor: ReaderSourceWorkspaceController["recolorAnnotation"],
): ((annotation: Annotation, color: HighlightColorKey) => Promise<void>) | undefined {
  return recolor
    ? async (annotation, color) => {
        await recolor(annotation, color);
      }
    : undefined;
}
