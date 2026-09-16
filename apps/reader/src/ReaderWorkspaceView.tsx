/* eslint-disable max-lines */
import { useCallback, useEffect, useRef, type JSX } from "react";

import { CommandPalette } from "./CommandPalette.js";
import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice.js";
import { inspectorPanelId, navigatorPanelId } from "./dockview-workspace-state.js";
import { DockviewWorkspace } from "./DockviewWorkspace.js";
import { inspectorSourceForTab } from "./inspector-source.js";
import { InspectorPane, type InspectorTab } from "./InspectorPane.js";
import { LibraryNavigator } from "./LibraryNavigator.js";
import { LibraryWorkspace } from "./LibraryWorkspace.js";
import { readerCommands } from "./reader-command-list.js";
import { ReaderHeader } from "./ReaderHeader.js";
import { RenderedSourceDocument } from "./RenderedSourceDocument.js";
import { SourceAdditionOverlays } from "./SourceAdditionOverlays.js";
import { useMediaQuery } from "./use-media-query.js";
import { useWorkspaceShellPreferences } from "./use-workspace-shell-preferences.js";
import { annotationDocumentTarget } from "./workspace-annotation-navigation.js";
import { WorkspaceToolTab } from "./WorkspaceToolTab.js";

import type { SourceDocumentRenderer } from "./RenderedSourceDocument.js";
import type {
  SourceWorkspaceLayout,
  SourceWorkspacePane,
  SourceWorkspaceTab,
  WorkspacePaneId,
} from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { ReaderDirectAccessState } from "./use-direct-access.js";
import type { MdbaseLibraryViewsController } from "./use-mdbase-library-views.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceAdditionController } from "./use-source-addition.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, SourceId, SourceSummary } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";
import type { ThemePreference } from "@mdbase-reader/ui";

export interface ReaderWorkspaceViewModel {
  readonly library: ReaderLibrarySnapshot;
  readonly gateway: ReaderWorkspaceGateway;
  readonly libraryViews: MdbaseLibraryViewsController;
  readonly source: SourceSummary | null;
  readonly openSources: readonly SourceSummary[];
  readonly workspace: ReaderWorkspaceController;
  readonly sourceWorkspace: SourceWorkspaceController;
  readonly composer: AnnotationComposerController;
  readonly readingResume: ReadingResumeState;
  readonly decorationProblem: string | null;
  readonly sourceAddition: SourceAdditionController;
  readonly bibliographyExport: BibliographyExportController;
  readonly sourceExport: SourceExportController;
  readonly renderDocument: SourceDocumentRenderer | undefined;
  readonly onSurfaceChange: (sessionId: string, surface: ReadingSurface | null) => void;
  readonly surfaces: ReadonlyMap<string, ReadingSurface>;
  readonly deploymentUpdateAvailable: boolean;
  readonly directAccess: ReaderDirectAccessState;
  readonly theme: ThemePreference;
  readonly changeTheme: () => void;
  readonly focusMode: boolean;
  readonly focusChromeVisible: boolean;
  readonly setFocusMode: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly commandsOpen: boolean;
  readonly setCommandsOpen: (value: boolean) => void;
  readonly pickSourceFile: (() => Promise<PickedFile | null>) | undefined;
}

interface PendingWorkspaceAnnotation {
  readonly annotation: Annotation;
  readonly paneId: WorkspacePaneId;
  readonly sourceId: SourceId;
}

// eslint-disable-next-line max-lines-per-function
export function ReaderWorkspaceView({
  model,
}: {
  readonly model: ReaderWorkspaceViewModel;
}): JSX.Element {
  const { library, source, workspace, sourceWorkspace, composer, sourceAddition } = model;
  const shell = useWorkspaceShellPreferences(
    library.sources[0]?.collectionId ?? library.collectionName,
  );
  const dock = sourceWorkspace.dock;
  const inspectorOpen = dock.isSideVisible(inspectorPanelId);
  const setInspectorOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)): void => {
      dock.setSideVisible(
        inspectorPanelId,
        typeof value === "function" ? value(dock.isSideVisible(inspectorPanelId)) : value,
      );
    },
    [dock],
  );
  const pendingAnnotationRef = useRef<PendingWorkspaceAnnotation | null>(null);
  const routedEditingIdRef = useRef(composer.editingAnnotationId);
  const commands = commandsForView(model, () => setInspectorOpen((value) => !value));
  const activeSource = sourceWorkspace.activeSourceId
    ? (library.sources.find(({ id }) => id === sourceWorkspace.activeSourceId) ?? null)
    : null;
  const inspectorSource = inspectorSourceForTab(
    sourceWorkspace.activeTab,
    activeSource,
    workspace.selectedSource,
  );
  const sourceToolsOpen = inspectorOpen;
  const mobile = useMediaQuery("(max-width: 680px)");
  const libraryOpen = dock.isSideVisible(navigatorPanelId);
  useEffect(() => {
    dock.setMobile(mobile);
    dock.setSinglePane(model.focusMode);
  }, [dock, mobile, model.focusMode]);
  const workbenchOwner = findWorkbenchOwner(
    sourceWorkspace.layout,
    inspectorSource?.id ?? null,
    shell.value.inspectorTab,
  );
  useEffect(() => {
    const revealId = composer.editingAnnotationId ?? composer.revealedAnnotationId;
    if (!revealId) {
      routedEditingIdRef.current = null;
      return;
    }
    if (revealId === routedEditingIdRef.current || !inspectorSource) {
      return;
    }
    routedEditingIdRef.current = revealId;
    const timer = globalThis.setTimeout(() => {
      const annotationsOwner = findWorkbenchOwner(
        sourceWorkspace.layout,
        inspectorSource.id,
        "annotations",
      );
      if (annotationsOwner && composer.editingAnnotationId) {
        if (sourceWorkspace.activeTab?.id !== annotationsOwner.tab.id) {
          sourceWorkspace.activateTab(annotationsOwner.tab.id, annotationsOwner.pane.id);
        }
      } else {
        if (shell.value.inspectorTab !== "annotations") {
          shell.update({ inspectorTab: "annotations" });
        }
        setInspectorOpen(true);
      }
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [
    composer.editingAnnotationId,
    composer.revealedAnnotationId,
    inspectorSource,
    model,
    shell,
    sourceWorkspace,
    setInspectorOpen,
  ]);
  useEffect(() => {
    const pendingAnnotation = pendingAnnotationRef.current;
    if (!pendingAnnotation || !composer.canOpenAnnotation) {
      return;
    }
    const activeTab = sourceWorkspace.activeTab;
    if (
      sourceWorkspace.layout.focusedPaneId === pendingAnnotation.paneId &&
      activeTab?.kind === "source" &&
      activeTab.sourceId === pendingAnnotation.sourceId &&
      activeTab.view === "document"
    ) {
      composer.open(pendingAnnotation.annotation);
      pendingAnnotationRef.current = null;
    }
  }, [composer, sourceWorkspace.activeTab, sourceWorkspace.layout.focusedPaneId]);
  return (
    <div
      data-density={shell.value.density}
      className={`reader-shell${model.deploymentUpdateAvailable ? " has-update" : ""}${model.focusChromeVisible ? "" : " is-focus-chrome-hidden"}`}
    >
      {model.deploymentUpdateAvailable ? <DeploymentUpdateNotice /> : null}
      <ReaderHeader
        density={shell.value.density}
        onToggleDensity={() =>
          shell.update({
            density: shell.value.density === "comfortable" ? "compact" : "comfortable",
          })
        }
        collectionName={library.collectionName}
        connectionState={library.connectionState}
        directAccess={model.directAccess}
        theme={model.theme}
        onChangeTheme={model.changeTheme}
        onOpenCommands={() => model.setCommandsOpen(true)}
        onToggleLibrary={() => toggleLibrary(model)}
        libraryOpen={libraryOpen}
        inspectorOpen={sourceToolsOpen}
        inspectorAvailable={true}
        onToggleInspector={() => setInspectorOpen((value) => !value)}
      />
      <main className="reader-main reader-dock-main">
        <DockviewWorkspace
          navigator={
            <LibraryNavigator
              open={true}
              sources={library.sources}
              selectedSourceId={source?.id ?? null}
              views={model.libraryViews.views}
              viewsLoading={model.libraryViews.loading}
              problem={model.libraryViews.problem}
              onPreviewSource={sourceWorkspace.preview}
              onOpenSource={sourceWorkspace.open}
              onOpenBeside={(id) => sourceWorkspace.openBeside(id)}
              onOpenView={(view) => {
                sourceWorkspace.openLibrary(view.key, view.name);
              }}
              onAddSource={sourceAddition.open}
              addingSource={sourceAddition.adding}
              bibliographyExport={model.bibliographyExport}
            />
          }
          sources={library.sources}
          sourceWorkspace={sourceWorkspace}
          focusMode={model.focusMode}
          readingResume={model.readingResume}
          decorationProblem={model.decorationProblem}
          annotationComposer={composer}
          sourceExport={model.sourceExport}
          renderDocument={(openSource, _paneId, sessionId) =>
            model.renderDocument ? (
              <RenderedSourceDocument
                key={sessionId}
                sessionId={sessionId}
                source={openSource}
                render={model.renderDocument}
                onSurfaceChange={model.onSurfaceChange}
              />
            ) : null
          }
          renderTool={(workspaceTab, paneId) => {
            const toolSource = library.sources.find(({ id }) => id === workspaceTab.sourceId);
            return toolSource ? (
              <WorkspaceToolTab
                tab={workspaceTab}
                source={toolSource}
                gateway={model.gateway}
                reconcileSource={workspace.reconcileSource}
                composer={composer}
                onOpenAnnotation={(annotation) => {
                  const target = annotationDocumentTarget(
                    sourceWorkspace.layout,
                    workspaceTab.sourceId,
                    paneId,
                  );
                  pendingAnnotationRef.current = {
                    annotation,
                    paneId: target.paneId,
                    sourceId: workspaceTab.sourceId,
                  };
                  if (target.tabId) {
                    sourceWorkspace.activateTab(target.tabId, target.paneId);
                  } else {
                    sourceWorkspace.openView(workspaceTab.sourceId, "document", target.paneId);
                  }
                  sourceWorkspace.focus(target.paneId);
                }}
                onDirtyChange={(dirty) => sourceWorkspace.markDirty(workspaceTab.id, paneId, dirty)}
                onOpenSourceView={(sourceId, view) =>
                  sourceWorkspace.openView(sourceId, view, paneId)
                }
              />
            ) : null;
          }}
          renderLibrary={(workspaceTab, focused) => {
            const libraryView = model.libraryViews.view(workspaceTab.libraryViewId);
            return (
              <LibraryWorkspace
                key={libraryView.key}
                view={libraryView}
                availableViews={model.libraryViews.views}
                allSources={library.sources}
                gateway={model.gateway}
                surfaces={model.surfaces}
                onOpenSourceView={(id, view) => sourceWorkspace.openView(id, view)}
                controller={model.libraryViews}
                focused={focused}
                onOpenView={(next) => sourceWorkspace.openLibrary(next.key, next.name)}
                onPreviewSource={(id) => sourceWorkspace.preview(id)}
                onOpenSource={(id) => sourceWorkspace.open(id)}
                onOpenBeside={(id) => sourceWorkspace.openBeside(id)}
                onAddSource={sourceAddition.open}
              />
            );
          }}
          onAddSource={sourceAddition.open}
          onToggleFocus={() => model.setFocusMode((value) => !value)}
          inspector={
            <InspectorPane
              open={true}
              tab={shell.value.inspectorTab}
              source={inspectorSource}
              paneLabel={`Pane ${String(sourceWorkspace.layout.panes.findIndex(({ id }) => id === sourceWorkspace.activePane.id) + 1)}`}
              workspace={workspace}
              composer={composer}
              gateway={model.gateway}
              workbenchOwner={
                workbenchOwner
                  ? {
                      tab: shell.value.inspectorTab,
                      paneLabel: `Pane ${String(sourceWorkspace.layout.panes.findIndex(({ id }) => id === workbenchOwner.pane.id) + 1)}`,
                      onOpen: () =>
                        sourceWorkspace.activateTab(workbenchOwner.tab.id, workbenchOwner.pane.id),
                    }
                  : null
              }
              onClose={() => setInspectorOpen(false)}
              onTabChange={(inspectorTab) => shell.update({ inspectorTab })}
              onPromote={(tab) => {
                if (inspectorSource) {
                  sourceWorkspace.openView(inspectorSource.id, tab, sourceWorkspace.activePane.id);
                  setInspectorOpen(false);
                }
              }}
              onOpenSourceView={(sourceId, view) =>
                sourceWorkspace.openView(sourceId, view, sourceWorkspace.activePane.id)
              }
            />
          }
        />
      </main>
      <SourceAdditionOverlays
        addition={sourceAddition}
        canChooseFile={Boolean(model.pickSourceFile)}
      />
      <CommandPalette
        open={model.commandsOpen}
        commands={commands}
        onClose={() => model.setCommandsOpen(false)}
      />
    </div>
  );
}

function findWorkbenchOwner(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId | null,
  view: InspectorTab,
): { readonly pane: SourceWorkspacePane; readonly tab: SourceWorkspaceTab } | undefined {
  if (!sourceId) {
    return undefined;
  }
  for (const pane of layout.panes) {
    const tab = pane.tabs.find(
      (candidate): candidate is SourceWorkspaceTab =>
        candidate.kind === "source" && candidate.sourceId === sourceId && candidate.view === view,
    );
    if (tab) {
      return { pane, tab };
    }
  }
  return undefined;
}

// prettier-ignore
function focusLibrarySearch(): void { globalThis.setTimeout(() => document.querySelector<HTMLInputElement>("#reader-library-search")?.focus(), 0); }

// prettier-ignore
function commandsForView(model: ReaderWorkspaceViewModel, toggle: () => void): ReturnType<typeof readerCommands> {
  return readerCommands({
    sources: model.library.sources,
    activeSource: model.source,
    workspace: model.sourceWorkspace,
    sourceExport: model.sourceExport,
    bibliographyExport: model.bibliographyExport,
    focusMode: model.focusMode,
    toggleFocus: () => model.setFocusMode((value) => !value),
    toggleLibrary: () => toggleLibrary(model),
    toggleInspector: toggle,
    searchLibrary: () => { model.sourceWorkspace.dock.setSideVisible(navigatorPanelId, true); focusLibrarySearch(); },
  });
}

function toggleLibrary(model: ReaderWorkspaceViewModel): void {
  const dock = model.sourceWorkspace.dock;
  dock.setSideVisible(navigatorPanelId, !dock.isSideVisible(navigatorPanelId));
}
