import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, type JSX } from "react";

import { AnnotationEditingContext } from "./AnnotationEditingContext.js";
import { AnnotationList } from "./AnnotationList.js";
import { useAnnotationPanelActions } from "./AnnotationPanelActions.js";
import { requestConfirmation } from "./confirmation.js";
import { CitationIcon, HighlightIcon, NoteIcon, PanelIcon } from "./icons.js";
import { lazyFeature } from "./lazy-feature.js";
import { publishSharedAnnotation } from "./shared-annotation-resource.js";

import type { AnnotationFileReader } from "./AnnotationImage.js";
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
  const { t } = useLingui();
  return (
    <aside
      id="reader-source-tools"
      className={open ? "inspector-pane" : "inspector-pane is-mobile-closed"}
      aria-label={t({ message: "Source workspace", context: "InspectorPane interface" })}
      aria-hidden={!open}
      inert={!open}
    >
      {/* The dock tab above names the source; this row only switches its tools. */}
      <div className="inspector-context">
        <span className="sr-only">
          {paneLabel}: {source?.title ?? t({ message: "No source in this pane" })}
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
          aria-label={t`Open ${tab} in workbench`}
          title={t({ message: "Keep open as a workbench tab" })}
          onClick={() => onPromote(tab)}
        >
          <PanelIcon />
        </button>
      </div>
      {source && workbenchOwner?.tab === tab ? (
        <div className="inspector-status inspector-workbench-owner">
          <strong>
            <Trans>
              {tabLabel(tab)}
              is open in
              {workbenchOwner.paneLabel}
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
  const { t } = useLingui();
  return (
    <div className="inspector-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        disabled={!enabled}
        aria-selected={tab === "annotations"}
        title={t({ message: "Annotations", context: "InspectorPane interface" })}
        onClick={() => onChange("annotations")}
      >
        <HighlightIcon />{" "}
        <span className="inspector-tab-label">
          <Trans>Annotations</Trans>
        </span>{" "}
        <span className="inspector-tab-count">{annotationCount ?? "—"}</span>
      </button>
      <button
        type="button"
        role="tab"
        disabled={!enabled}
        aria-selected={tab === "note"}
        title={translate({ message: "Source note" })}
        onPointerEnter={SourceNoteEditor.preload}
        onFocus={SourceNoteEditor.preload}
        onClick={() => onChange("note")}
      >
        <NoteIcon />{" "}
        <span className="inspector-tab-label">
          <Trans>Source note</Trans>
        </span>
      </button>
      <button
        type="button"
        role="tab"
        disabled={!enabled}
        aria-selected={tab === "citation"}
        title={translate({ message: "Citation", context: "InspectorPane status or action" })}
        onPointerEnter={CitationEditor.preload}
        onFocus={CitationEditor.preload}
        onClick={() => onChange("citation")}
      >
        <CitationIcon />{" "}
        <span className="inspector-tab-label">
          <Trans>Citation</Trans>
        </span>
      </button>
    </div>
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
  return tab === "annotations" ? (
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
  ) : (
    <CitationEditor workspace={workspace} />
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
