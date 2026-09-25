/* eslint-disable max-lines */
import { useCallback, useEffect, useMemo, useRef, type JSX } from "react";

import { confirmCollectionSwitch } from "./collection-switching.js";
import { CommandPalette } from "./CommandPalette.js";
import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice.js";
import { inspectorPanelId, navigatorPanelId } from "./dockview-workspace-state.js";
import { DockviewWorkspace } from "./DockviewWorkspace.js";
import { importHref } from "./import-navigation.js";
import { inspectorSourceForTab } from "./inspector-source.js";
import { InspectorPane, type InspectorTab } from "./InspectorPane.js";
import { LibraryNavigator } from "./LibraryNavigator.js";
import { LibraryWorkspace } from "./LibraryWorkspace.js";
import { readerCommands } from "./reader-command-list.js";
import { ReaderHeader } from "./ReaderHeader.js";
import { RenderedSourceDocument } from "./RenderedSourceDocument.js";
import { SourceAdditionOverlays } from "./SourceAdditionOverlays.js";
import { useAnnotationCounts } from "./use-annotation-counts.js";
import { useFileDrop } from "./use-file-drop.js";
import { useMediaQuery } from "./use-media-query.js";
import {
  useWorkspaceShellPreferences,
  type WorkspaceShellPreferencesController,
} from "./use-workspace-shell-preferences.js";
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
import type { ReadingSurface, ReadingTypography } from "@mdbase-reader/reading-surface";
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
  readonly changeTheme: (theme: ThemePreference) => void;
  readonly focusMode: boolean;
  readonly focusChromeVisible: boolean;
  readonly setFocusMode: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly commandsOpen: boolean;
  readonly setCommandsOpen: (value: boolean) => void;
  readonly pickSourceFile: (() => Promise<PickedFile | null>) | undefined;
}

interface PendingWorkspaceAnnotation {
  readonly annotation: Annotation;
  /** The pane the document opens in, or null for a new pane (opened beside). */
  readonly paneId: WorkspacePaneId | null;
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
  const fileDrop = useFileDrop((file) => void sourceAddition.addFile(file));
  const routedEditingIdRef = useRef(composer.editingAnnotationId);
  const commands = commandsForView(model, () => dock.toggleSidebar("right"), {
    density: shell.value.density,
    setDensity: (density) => shell.update({ density }),
  });
  const activeSource = sourceWorkspace.activeSourceId
    ? (library.sources.find(({ id }) => id === sourceWorkspace.activeSourceId) ?? null)
    : null;
  const inspectorSource = inspectorSourceForTab(
    sourceWorkspace.activeTab,
    activeSource,
    workspace.selectedSource,
  );
  const sourceToolsOpen = dock.isSidebarVisible("right");
  const mobile = useMediaQuery("(max-width: 680px)");
  const libraryOpen = dock.isSidebarVisible("left");
  useEffect(() => {
    dock.setMobile(mobile);
    dock.setSinglePane(model.focusMode);
  }, [dock, mobile, model.focusMode]);
  const reading = useReadingPreferences(model, shell, mobile);
  const annotationCounts = useLibraryAnnotationCounts(model);
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
      if (shell.value.inspectorTab !== "annotations") {
        shell.update({ inspectorTab: "annotations" });
      }
      setInspectorOpen(true);
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
      (pendingAnnotation.paneId === null ||
        sourceWorkspace.layout.focusedPaneId === pendingAnnotation.paneId) &&
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
      {...fileDrop.handlers}
    >
      {fileDrop.active ? (
        <div className="file-drop-overlay" aria-hidden="true">
          <div>
            <strong>Drop to add to your library</strong>
            <span>PDF, EPUB or saved web page</span>
          </div>
        </div>
      ) : null}
      {model.deploymentUpdateAvailable ? <DeploymentUpdateNotice /> : null}
      <ReaderHeader
        {...reading}
        density={shell.value.density}
        onChangeDensity={(density) => shell.update({ density })}
        collectionName={library.collectionName}
        beforeCollectionSwitch={() =>
          confirmCollectionSwitch(sourceWorkspace.layout, library.sources)
        }
        connectionState={library.connectionState}
        directAccess={model.directAccess}
        theme={model.theme}
        onChangeTheme={model.changeTheme}
        onOpenCommands={() => model.setCommandsOpen(true)}
        onToggleLibrary={() => toggleLibrary(model)}
        libraryOpen={libraryOpen}
        inspectorOpen={sourceToolsOpen}
        inspectorAvailable={true}
        onToggleInspector={() => dock.toggleSidebar("right")}
      />
      <main className="reader-main reader-dock-main">
        <DockviewWorkspace
          navigator={
            <LibraryNavigator
              open={true}
              sources={library.sources}
              openSources={model.openSources}
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
              hideRecent={libraryTabActive(sourceWorkspace)}
            />
          }
          sources={library.sources}
          surfaces={model.surfaces}
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
                onOpenSource={(id) => sourceWorkspace.open(id)}
                onOpenBeside={(id) => sourceWorkspace.openBeside(id)}
                onAddSource={sourceAddition.open}
                bibliographyExport={model.bibliographyExport}
                annotationCounts={annotationCounts}
                onSourceChanged={workspace.reconcileSource}
                onOpenAnnotation={(annotation, beside) => {
                  const sourceId = annotation.sourceId;
                  if (beside) {
                    pendingAnnotationRef.current = { annotation, paneId: null, sourceId };
                    sourceWorkspace.openBeside(sourceId, "document");
                    return;
                  }
                  const target = annotationDocumentTarget(
                    sourceWorkspace.layout,
                    sourceId,
                    sourceWorkspace.layout.focusedPaneId,
                  );
                  pendingAnnotationRef.current = { annotation, paneId: target.paneId, sourceId };
                  if (target.tabId) {
                    sourceWorkspace.activateTab(target.tabId, target.paneId);
                  } else {
                    sourceWorkspace.openView(sourceId, "document", target.paneId);
                  }
                  sourceWorkspace.focus(target.paneId);
                }}
              />
            );
          }}
          onAddSource={sourceAddition.open}
          onToggleFocus={() => model.setFocusMode((value) => !value)}
          inspectorSource={inspectorSource}
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

/**
 * Applies the reader's type settings and sidebar behaviour, and returns the header's controls
 * for them.
 */
function useReadingPreferences(
  model: ReaderWorkspaceViewModel,
  shell: WorkspaceShellPreferencesController,
  mobile: boolean,
): Pick<
  Parameters<typeof ReaderHeader>[0],
  | "typography"
  | "onChangeTypography"
  | "sidebarWhileReading"
  | "onChangeSidebarWhileReading"
  | "readingMode"
  | "readingModeAvailable"
  | "onToggleReadingMode"
> {
  const { typography, sidebarWhileReading } = shell.value;
  const activeTab = model.sourceWorkspace.activeTab;
  useApplyTypography(model.surfaces, typography);
  useSidebarWhileReading(
    model.sourceWorkspace,
    sidebarWhileReading === "hide" && !mobile && !model.focusMode,
  );
  return {
    typography,
    onChangeTypography: (next) => shell.update({ typography: next }),
    sidebarWhileReading,
    onChangeSidebarWhileReading: (next) => shell.update({ sidebarWhileReading: next }),
    readingMode: model.focusMode,
    readingModeAvailable: activeTab?.kind === "source" && activeTab.view === "document",
    onToggleReadingMode: () => model.setFocusMode((value) => !value),
  };
}

/** The index's counts, corrected by the annotations already loaded for the selected source. */
function useLibraryAnnotationCounts(
  model: ReaderWorkspaceViewModel,
): ReadonlyMap<SourceId, number> {
  const loaded = model.workspace.annotations;
  const counts = useAnnotationCounts(model.gateway, loaded);
  const sourceId =
    model.workspace.sourceRecord.status === "ready" ? model.workspace.sourceRecord.value.id : null;
  return useMemo(() => {
    if (!sourceId || loaded.status !== "ready" || counts.get(sourceId) === loaded.value.length) {
      return counts;
    }
    return new Map(counts).set(sourceId, loaded.value.length);
  }, [counts, loaded, sourceId]);
}

/** Keeps every open reflowable document on the reader's chosen type settings. */
function useApplyTypography(
  surfaces: ReadonlyMap<string, ReadingSurface>,
  typography: ReadingTypography,
): void {
  useEffect(() => {
    for (const surface of surfaces.values()) {
      void surface.capabilities.typography?.setTypography(typography).catch(() => undefined);
    }
  }, [surfaces, typography]);
}

/**
 * Hides the Sources sidebar when a document takes focus, and restores it on returning to a
 * library tab, but only if Reader was the one that hid it.
 */
function useSidebarWhileReading(workspace: SourceWorkspaceController, enabled: boolean): void {
  const dock = workspace.dock;
  const activeTab = workspace.activeTab;
  const kind =
    activeTab?.kind === "source"
      ? activeTab.view === "document"
        ? "document"
        : "tool"
      : "library";
  const previousKind = useRef<string | null>(null);
  const hiddenByReader = useRef(false);
  useEffect(() => {
    const previous = previousKind.current;
    previousKind.current = kind;
    if (!enabled || previous === kind || activeTab === null) {
      return;
    }
    if (kind === "document" && dock.isSideVisible(navigatorPanelId)) {
      hiddenByReader.current = true;
      dock.setSideVisible(navigatorPanelId, false);
    } else if (kind === "library" && hiddenByReader.current) {
      hiddenByReader.current = false;
      if (!dock.isSideVisible(navigatorPanelId)) {
        dock.setSideVisible(navigatorPanelId, true);
      }
    }
  }, [activeTab, dock, enabled, kind]);
}

function findWorkbenchOwner(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId | null,
  view: InspectorTab,
): { readonly pane: SourceWorkspacePane; readonly tab: SourceWorkspaceTab } | undefined {
  // Citation forms still use an explicit validated save; text editors share their writer.
  if (!sourceId || view !== "citation") {
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

function commandsForView(
  model: ReaderWorkspaceViewModel,
  toggleInspector: () => void,
  display: {
    readonly density: "comfortable" | "compact";
    readonly setDensity: (density: "comfortable" | "compact") => void;
  },
): ReturnType<typeof readerCommands> {
  return readerCommands({
    sources: model.library.sources,
    activeSource: model.source,
    workspace: model.sourceWorkspace,
    sourceExport: model.sourceExport,
    bibliographyExport: model.bibliographyExport,
    focusMode: model.focusMode,
    bookmark: model.composer.canBookmark ? model.composer.bookmark : null,
    toggleFocus: () => model.setFocusMode((value) => !value),
    toggleLibrary: () => toggleLibrary(model),
    toggleInspector,
    searchLibrary: () => {
      model.sourceWorkspace.dock.setSideVisible(navigatorPanelId, true);
      focusLibrarySearch();
    },
    addSource: model.sourceAddition.open,
    importHref: importHref(),
    theme: model.theme,
    setTheme: model.changeTheme,
    ...display,
  });
}

function toggleLibrary(model: ReaderWorkspaceViewModel): void {
  const dock = model.sourceWorkspace.dock;
  dock.toggleSidebar("left");
}

function libraryTabActive(workspace: {
  readonly activeTab: { readonly kind: string } | null;
}): boolean {
  return workspace.activeTab?.kind === "library";
}
