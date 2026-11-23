import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type JSX,
  type ReactNode,
  type RefObject,
} from "react";

import { confirmCollectionSwitch } from "./collection-switching.js";
import { useShellNotices } from "./CreateFollowThroughNotice.js";
import { useReaderFeedbackContext } from "./FeedbackRoot.js";
import { bindHighlightSettings } from "./highlight-colors.js";
import { importHref } from "./import-navigation.js";
import { inspectorSourceForTab } from "./inspector-source.js";
import { InspectorPane, preloadInspectorTools } from "./InspectorPane.js";
import { LibraryNavigator } from "./LibraryNavigator.js";
import { LibraryWorkspace } from "./LibraryWorkspace.js";
import { mobileSourceBar } from "./mobile-source-bar.js";
import { OverlayPresence } from "./OverlayPresence.js";
import { followedPane, notesView } from "./panel-workspace-state.js";
import { PanelWorkspace } from "./PanelWorkspace.js";
import { PaneNotes } from "./PaneNotes.js";
import { useReaderMdbase } from "./reader-collections.js";
import { readerCommandGroupLabel, readerCommands } from "./reader-command-list.js";
import { ReaderCommandPalette as CommandPalette } from "./ReaderCommandPalette.js";
import { ReaderHeader } from "./ReaderHeader.js";
import { RenderedSourceDocument } from "./RenderedSourceDocument.js";
import { useSdkConnectionState } from "./sdk-connection-state.js";
import { SettingsPage, useSettingsPage } from "./SettingsPage.js";
import { SourceAdditionOverlays } from "./SourceAdditionOverlays.js";
import { useSourcePartCreation } from "./SourcePartCreation.js";
import { SourceRemovalDialog } from "./SourceRemovalDialog.js";
import { useAnnotationCounts } from "./use-annotation-counts.js";
import { useFileDrop } from "./use-file-drop.js";
import { useMediaQuery } from "./use-media-query.js";
import { useReadingChrome } from "./use-reading-chrome.js";
import {
  useWorkspaceShellPreferences,
  type WorkspaceShellPreferencesController,
} from "./use-workspace-shell-preferences.js";
import { whenIdle } from "./when-idle.js";
import { annotationDocumentTarget } from "./workspace-annotation-navigation.js";
import { WorkspaceToolTab } from "./WorkspaceToolTab.js";

import type { ReaderPanelWorkspace } from "./panel-workspace.js";
import type { SourceDocumentRenderer } from "./RenderedSourceDocument.js";
import type {
  NotesView,
  SourceWorkspaceLayout,
  SourceWorkspacePane,
  SourceWorkspaceTab,
  WorkspacePaneId,
} from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { DocumentAttachmentController } from "./use-document-attachment.js";
import type { MdbaseLibraryViewsController } from "./use-mdbase-library-views.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceAdditionController } from "./use-source-addition.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceRemovalController } from "./use-source-removal.js";
import type { useSourceStatus } from "./use-source-status.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type { PanelDescriptor } from "@mdbase-dev/panels";
import type { ThemePreference } from "@mdbase-dev/ui/theme";
import type { Annotation, SourceId, SourceSummary } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";
import type { ReadingSurface, ReadingTypography } from "@mdbase-reader/reading-surface";

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
  readonly documentAttachment: DocumentAttachmentController | null;
  readonly bibliographyExport: BibliographyExportController;
  readonly sourceExport: SourceExportController;
  readonly sourceRemoval: SourceRemovalController;
  readonly sourceStatus: ReturnType<typeof useSourceStatus>;
  readonly renderDocument: SourceDocumentRenderer | undefined;
  readonly onSurfaceChange: (sessionId: string, surface: ReadingSurface | null) => void;
  readonly surfaces: ReadonlyMap<string, ReadingSurface>;
  readonly deploymentUpdateAvailable: boolean;
  readonly theme: ThemePreference;
  readonly changeTheme: (theme: ThemePreference) => void;
  readonly focusMode: boolean;
  readonly setFocusMode: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly commandsOpen: boolean | "shortcuts";
  readonly setCommandsOpen: (value: boolean | "shortcuts") => void;
  readonly pickSourceFile: (() => Promise<PickedFile | null>) | undefined;
}

interface PendingWorkspaceAnnotation {
  readonly annotation: Annotation;
  /** The pane the document opens in, or null for a new pane (opened beside). */
  readonly paneId: WorkspacePaneId | null;
  readonly sourceId: SourceId;
}

/** Every open tab is listed; other groups show a few until the reader types. */
const paletteShowsAll = ["Open tabs", "Sources"];

// eslint-disable-next-line max-lines-per-function
export function ReaderWorkspaceView({
  model,
}: {
  readonly model: ReaderWorkspaceViewModel;
}): JSX.Element {
  const { t } = useLingui();
  const { library, source, workspace, sourceWorkspace, composer, sourceAddition } = model;
  useReaderFeedbackContext(Boolean(sourceWorkspace.activeSourceId), library.collectionName);
  const connectionState = useSdkConnectionState(useReaderMdbase(), library.connectionState);
  const shell = useWorkspaceShellPreferences(
    library.sources[0]?.collectionId ?? library.collectionName,
  );
  const dock = sourceWorkspace.dock;
  const pendingAnnotationRef = useRef<PendingWorkspaceAnnotation | null>(null);
  const fileDrop = useFileDrop((file) => void sourceAddition.addFile(file));
  const routedEditingIdRef = useRef(composer.editingAnnotationId);
  const settingsPage = useSettingsPage();
  const commands = useCommandsForView(model, () => dock.toggleSidebar("right"), {
    density: shell.value.density,
    setDensity: (density) => shell.update({ density }),
    openSettings: settingsPage.show,
  });
  const inspectorSource = useLeaderSource(model);
  const sourceToolsOpen = dock.isSidebarVisible("right");
  useEffect(() => whenIdle(preloadInspectorTools), []);
  const mobile = useMediaQuery("(max-width: 680px)");
  const libraryOpen = dock.isSidebarVisible("left");
  useEffect(() => {
    dock.setSinglePane(model.focusMode);
  }, [dock, model.focusMode]);
  const reading = useReadingPreferences(model, shell);
  const shellRef = useRef<HTMLDivElement>(null);
  useShellChrome(shellRef, model, mobile);
  const annotationCounts = useLibraryAnnotationCounts(model);
  const notices = useShellNotices(
    model.deploymentUpdateAvailable,
    model.gateway.createFollowThrough,
  );
  const collectionSettings = model.gateway.settings;
  // Every swatch, card and filter follows the collection's highlight colours, live.
  useEffect(
    () => (collectionSettings ? bindHighlightSettings(collectionSettings) : undefined),
    [collectionSettings],
  );
  const beforeCollectionSwitch = (): Promise<boolean> =>
    confirmCollectionSwitch(sourceWorkspace.layout, library.sources);
  const paneLabel = (id: WorkspacePaneId): string =>
    translate`Pane ${String(sourceWorkspace.layout.panes.findIndex((pane) => pane.id === id) + 1)}`;
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
    // The annotation's card is in the Annotations panel, wherever the reader keeps it.
    const timer = globalThis.setTimeout(() => dock.showNotes("annotations"), 0);
    return () => globalThis.clearTimeout(timer);
  }, [composer.editingAnnotationId, composer.revealedAnnotationId, inspectorSource, dock]);
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
  const workspaceShell = (
    <div
      data-density={shell.value.density}
      ref={shellRef}
      className={`reader-shell${notices ? " has-update" : ""}`}
      {...fileDrop.handlers}
    >
      <a
        hidden={!libraryTabActive(sourceWorkspace)}
        className="reader-skip-link"
        href="#reader-library-results"
        onClick={(event) => {
          event.preventDefault();
          focusLibraryResults(shellRef.current);
        }}
      >
        <Trans>Skip to sources</Trans>
      </a>
      {fileDrop.active ? (
        <div className="file-drop-overlay" aria-hidden="true">
          <div>
            <strong>
              <Trans>Drop to add to your library</Trans>
            </strong>
            <span>
              <Trans>PDF, EPUB or saved web page</Trans>
            </span>
          </div>
        </div>
      ) : null}
      {notices}
      {model.focusMode ? <div className="reading-chrome-reveal" aria-hidden="true" /> : null}
      <ReaderHeader
        {...reading}
        density={shell.value.density}
        onChangeDensity={(density) => shell.update({ density })}
        collectionName={library.collectionName}
        beforeCollectionSwitch={beforeCollectionSwitch}
        connectionState={connectionState}
        theme={model.theme}
        onChangeTheme={model.changeTheme}
        onOpenCommands={() => model.setCommandsOpen(true)}
        onToggleLibrary={() => toggleLibrary(model)}
        libraryOpen={libraryOpen}
        inspectorOpen={sourceToolsOpen}
        inspectorAvailable={true}
        onToggleInspector={() => dock.toggleSidebar("right")}
        sourceBar={mobileSourceBar(model)}
        onOpenSettings={settingsPage.show}
      />
      <main className="reader-main reader-dock-main">
        <PanelWorkspace
          navigator={
            <LibraryNavigator
              open={true}
              sources={library.sources}
              openSources={model.openSources}
              selectedSourceId={source?.id ?? null}
              views={model.libraryViews.views}
              activeView={sourceWorkspace.activeTab?.libraryViewId}
              viewsLoading={model.libraryViews.loading}
              indexLoading={library.sourceIndex?.complete === false}
              problem={model.libraryViews.problem}
              onPreviewSource={sourceWorkspace.preview}
              onOpenSource={sourceWorkspace.open}
              onOpenBeside={(id) => sourceWorkspace.openBeside(id)}
              onOpenView={(view) => {
                sourceWorkspace.openLibrary(view.key, view.name);
              }}
              onOpenViewInTab={(view) => sourceWorkspace.openLibraryTab(view.key, view.name)}
              onAddSource={sourceAddition.open}
              addingSource={sourceAddition.adding}
              hideRecent={libraryTabActive(sourceWorkspace)}
            />
          }
          sources={library.sources}
          documentAttachment={model.documentAttachment}
          surfaces={model.surfaces}
          sourceWorkspace={sourceWorkspace}
          focusMode={model.focusMode}
          readingResume={model.readingResume}
          decorationProblem={model.decorationProblem}
          annotationComposer={composer}
          sourceExport={model.sourceExport}
          sourceRemoval={model.sourceRemoval}
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
                indexLoading={library.sourceIndex?.complete === false}
                gateway={model.gateway}
                onOpenSourceView={(id, view) => sourceWorkspace.openView(id, view)}
                controller={model.libraryViews}
                focused={focused}
                // A tab's own view switcher changes that tab, even one pinned to its view.
                onOpenView={(next) => dock.showLibraryView(workspaceTab.id, next.key, next.name)}
                onOpenSource={(id) => sourceWorkspace.open(id)}
                onOpenBeside={(id) => sourceWorkspace.openBeside(id)}
                onInspectSource={workspace.selectSource}
                onAddSource={sourceAddition.open}
                bibliographyExport={model.bibliographyExport}
                annotationCounts={annotationCounts}
                onSourceChanged={workspace.reconcileSource}
                changeStatus={model.sourceStatus.change}
                {...(model.sourceRemoval.request
                  ? { onRemoveSource: model.sourceRemoval.request }
                  : {})}
                onOpenAnnotation={(annotation, beside) => {
                  const sourceId = annotation.sourceId;
                  if (beside) {
                    pendingAnnotationRef.current = { annotation, paneId: null, sourceId };
                    sourceWorkspace.openBeside(sourceId);
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
          annotationCount={
            inspectorSource && workspace.annotations.status === "ready"
              ? workspace.annotations.value.length
              : null
          }
          renderNotes={(panel, view, visible) =>
            renderNotesPanel(
              {
                model,
                composer,
                inspectorSource,
                paneLabel,
                openAnnotation: (annotation, sourceId, paneId) => {
                  const target = annotationDocumentTarget(sourceWorkspace.layout, sourceId, paneId);
                  pendingAnnotationRef.current = { annotation, paneId: target.paneId, sourceId };
                  if (target.tabId) {
                    sourceWorkspace.activateTab(target.tabId, target.paneId);
                  } else {
                    sourceWorkspace.openView(sourceId, "document", target.paneId);
                  }
                  sourceWorkspace.focus(target.paneId);
                },
              },
              panel,
              view,
              visible,
            )
          }
        />
      </main>
      <SourceAdditionOverlays
        addition={sourceAddition}
        canChooseFile={Boolean(model.pickSourceFile)}
      />
      <SourceRemovalDialog removal={model.sourceRemoval} sources={library.sources} />
      <div id="reader-notices" className="reader-notices" />
      {model.sourceStatus.notice}
      <CommandPalette
        label={t({ message: "Reader commands", context: "ReaderWorkspaceView interface" })}
        placeholder={t({ message: "Search sources and commands" })}
        showAll={paletteShowsAll}
        groupLabel={readerCommandGroupLabel}
        open={Boolean(model.commandsOpen)}
        shortcuts={model.commandsOpen === "shortcuts"}
        commands={commands}
        onClose={() => model.setCommandsOpen(false)}
      />
    </div>
  );
  return (
    <>
      {workspaceShell}
      <OverlayPresence open={settingsPage.open}>
        <SettingsPage
          density={shell.value.density}
          display={{
            theme: model.theme,
            onChangeTheme: model.changeTheme,
            typography: shell.value.typography,
            onChangeTypography: (typography) => shell.update({ typography }),
            density: shell.value.density,
            onChangeDensity: (density) => shell.update({ density }),
            sidebarWhileReading: shell.value.sidebarWhileReading,
            onChangeSidebarWhileReading: (value) => shell.update({ sidebarWhileReading: value }),
          }}
          gateway={model.gateway}
          library={library.sources}
          openSources={model.openSources}
          collectionName={library.collectionName}
          connectionState={connectionState}
          beforeCollectionSwitch={beforeCollectionSwitch}
          onClose={settingsPage.hide}
        />
      </OverlayPresence>
    </>
  );
}

/**
 * Applies the reader's type settings and sidebar behaviour, and returns the header's controls
 * for them.
 */
/**
 * The source the Notes panels are about: that of the tab the reader last worked in. The
 * workspace is told, so that pinning a Notes panel holds it on this source.
 */
function useLeaderSource(model: ReaderWorkspaceViewModel): SourceSummary | null {
  const { library, workspace, sourceWorkspace } = model;
  const dock = sourceWorkspace.dock;
  const leaderTab = dock.leaderTab();
  const leaderSource =
    leaderTab?.kind === "source"
      ? (library.sources.find(({ id }) => id === leaderTab.sourceId) ?? null)
      : null;
  // A library tab has no source of its own: Notes about it show the source picked in it.
  const selectedSourceId = workspace.selectedSource?.id ?? null;
  useEffect(() => {
    dock.setSelected(selectedSourceId);
  }, [dock, selectedSourceId]);
  return inspectorSourceForTab(leaderTab, leaderSource, workspace.selectedSource);
}

/**
 * A Notes panel's content. One that follows the tab the reader last used shares the tools
 * Reader has loaded for that source. One that follows a pane loads its own.
 */
function renderNotesPanel(
  context: {
    readonly model: ReaderWorkspaceViewModel;
    readonly composer: ReaderWorkspaceViewModel["composer"];
    readonly inspectorSource: SourceSummary | null;
    readonly paneLabel: (id: WorkspacePaneId) => string;
    readonly openAnnotation: (
      annotation: Annotation,
      sourceId: SourceId,
      paneId: WorkspacePaneId,
    ) => void;
  },
  panel: PanelDescriptor,
  view: NotesView,
  visible: boolean,
): ReactNode {
  const { model, composer, inspectorSource, paneLabel } = context;
  const { library, sourceWorkspace, workspace } = model;
  const dock = sourceWorkspace.dock;
  const pane = followedPane(panel);
  const followedId = pane ? dock.sourceOf(panel.id) : null;
  const source = pane
    ? (library.sources.find(({ id }) => id === followedId) ?? null)
    : inspectorSource;
  const tabOwner = findWorkbenchOwner(sourceWorkspace.layout, source?.id ?? null, view);
  // The same citation in a panel that follows a pane: this one makes way for it too.
  const panelOwner = pane ? undefined : findCitationPanel(dock, source?.id ?? null, view);
  const workbenchOwner = tabOwner
    ? {
        paneLabel: paneLabel(tabOwner.pane.id),
        onOpen: () => sourceWorkspace.activateTab(tabOwner.tab.id, tabOwner.pane.id),
      }
    : panelOwner
      ? { paneLabel: paneLabel(panelOwner.pane), onOpen: () => dock.activate(panelOwner.id) }
      : null;
  const openSourceView = (sourceId: SourceId, sourceView: "document" | "citation"): void =>
    sourceWorkspace.openView(sourceId, sourceView, pane ?? sourceWorkspace.activePane.id);
  const inspector = (
    <InspectorPane
      tab={view}
      visible={visible}
      source={pane ? null : inspectorSource}
      paneLabel={paneLabel(pane ?? sourceWorkspace.activePane.id)}
      workspace={workspace}
      composer={composer}
      gateway={model.gateway}
      workbenchOwner={workbenchOwner}
      onOpenSourceView={openSourceView}
    />
  );
  if (!pane) {
    return inspector;
  }
  return (
    <PaneNotes
      tab={view}
      visible={visible}
      source={source}
      empty={inspector}
      paneLabel={paneLabel(pane)}
      composer={composer}
      gateway={model.gateway}
      reconcileSource={workspace.reconcileSource}
      workbenchOwner={workbenchOwner}
      onOpenAnnotation={(annotation, owner) => context.openAnnotation(annotation, owner.id, pane)}
      onOpenSourceView={openSourceView}
    />
  );
}

/** A citation panel that follows a pane and is showing this source: it owns the form. */
function findCitationPanel(
  dock: ReaderPanelWorkspace,
  sourceId: SourceId | null,
  view: NotesView,
): { readonly id: string; readonly pane: string } | undefined {
  if (!sourceId || view !== "citation") {
    return undefined;
  }
  for (const panel of dock.notesPanels()) {
    const pane = followedPane(panel);
    if (pane && notesView(panel) === view && dock.sourceOf(panel.id) === sourceId) {
      return { id: panel.id, pane };
    }
  }
  return undefined;
}

function useReadingPreferences(
  model: ReaderWorkspaceViewModel,
  shell: WorkspaceShellPreferencesController,
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
  const dock = model.sourceWorkspace.dock;
  useEffect(() => {
    dock.setHideWhileReading(sidebarWhileReading === "hide");
  }, [dock, sidebarWhileReading]);
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

/** Whether the header and bars show; a phone makes way for the document it is reading. */
function useShellChrome(
  shell: RefObject<HTMLElement | null>,
  model: ReaderWorkspaceViewModel,
  mobile: boolean,
): void {
  const activeTab = model.sourceWorkspace.activeTab;
  const readingDocument = activeTab?.kind === "source" && activeTab.view === "document";
  const dock = model.sourceWorkspace.dock;
  const relayout = useCallback(() => {
    // Reading mode takes the tab strips away with the header, in the same frame.
    dock.setChrome(shell.current?.hasAttribute("data-chrome-hidden") ?? false);
  }, [dock, shell]);
  useReadingChrome({
    shell,
    onChange: relayout,
    focusMode: model.focusMode,
    autoHide: mobile && readingDocument,
    surface: readingDocument ? (model.surfaces.get(activeTab.id) ?? null) : null,
  });
}

/** The index's counts, corrected by the annotations already loaded for the selected source. */
export function useLibraryAnnotationCounts(
  model: ReaderWorkspaceViewModel,
): ReadonlyMap<SourceId, number> | null {
  const loaded = model.workspace.annotations;
  const sourceId =
    model.workspace.sourceRecord.status === "ready" ? model.workspace.sourceRecord.value.id : null;
  const counts = useAnnotationCounts(
    model.gateway,
    model.library.sourceIndex?.complete !== false && (!sourceId || loaded.status !== "loading"),
  );
  return useMemo(() => {
    const known = counts
      ? new Map(model.library.sources.map(({ id }) => [id, counts.get(id) ?? 0]))
      : null;
    if (!sourceId || loaded.status !== "ready") {
      return known;
    }
    const ownedCount = loaded.value.filter((annotation) => annotation.sourceId === sourceId).length;
    return (known ?? new Map()).set(sourceId, ownedCount);
  }, [counts, loaded, sourceId, model.library.sources]);
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

function findWorkbenchOwner(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId | null,
  view: NotesView,
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

function useCommandsForView(
  model: ReaderWorkspaceViewModel,
  toggleInspector: () => void,
  display: {
    readonly density: "comfortable" | "compact";
    readonly setDensity: (density: "comfortable" | "compact") => void;
    readonly openSettings: () => void;
  },
): ReturnType<typeof readerCommands> {
  const createSourceParts = useSourcePartCreation();
  return readerCommands({
    libraryViews: model.libraryViews.views,
    sources: model.library.sources,
    activeSource:
      model.sourceWorkspace.activeTab?.kind === "library"
        ? model.workspace.selectedSource
        : model.source,
    workspace: model.sourceWorkspace,
    sourceExport: model.sourceExport,
    removeSource: model.sourceRemoval.request,
    changeStatus: model.sourceStatus.change,
    createSourceParts,
    bibliographyExport: model.bibliographyExport,
    focusMode: model.focusMode,
    bookmark: model.composer.canBookmark ? model.composer.bookmark : null,
    toggleFocus: () => model.setFocusMode((value) => !value),
    toggleLibrary: () => toggleLibrary(model),
    toggleInspector,
    addSource: model.sourceAddition.open,
    openShortcuts: () => model.setCommandsOpen("shortcuts"),
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

function focusLibraryResults(shell: HTMLElement | null): void {
  const results = shell?.querySelector<HTMLElement>(
    ".workspace-pane.is-focused .library-workspace-results",
  );
  const firstResult = results?.querySelector<HTMLElement>(
    '[data-row-index][tabindex="0"], .search-passage-list button',
  );
  (firstResult ?? results)?.focus();
}
