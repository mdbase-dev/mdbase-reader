import { useState, type JSX } from "react";

import { CommandPalette } from "./CommandPalette.js";
import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice.js";
import { DocumentWorkspace } from "./DocumentWorkspace.js";
import { InspectorPane } from "./InspectorPane.js";
import { LibraryNavigator } from "./LibraryNavigator.js";
import { LibraryWorkspace } from "./LibraryWorkspace.js";
import { InspectorResizeHandle, LibraryResizeHandle } from "./PanelResizeHandle.js";
import { readerMainClass, useResponsiveInspector } from "./reader-app-hooks.js";
import { readerCommands } from "./reader-command-list.js";
import { ReaderHeader } from "./ReaderHeader.js";
import { RenderedSourceDocument } from "./RenderedSourceDocument.js";
import { SourceAdditionOverlays } from "./SourceAdditionOverlays.js";
import { useWorkspaceShellPreferences } from "./use-workspace-shell-preferences.js";
import { workspaceShellStyle } from "./workspace-shell-preferences.js";
import { WorkspaceToolTab } from "./WorkspaceToolTab.js";

import type { SourceDocumentRenderer } from "./RenderedSourceDocument.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { MdbaseLibraryViewsController } from "./use-mdbase-library-views.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceAdditionController } from "./use-source-addition.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceSummary } from "@mdbase-reader/core";
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
  readonly deploymentUpdateAvailable: boolean;
  readonly theme: ThemePreference;
  readonly changeTheme: () => void;
  readonly focusMode: boolean;
  readonly focusChromeVisible: boolean;
  readonly setFocusMode: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly mobileLibraryOpen: boolean;
  readonly setMobileLibraryOpen: (value: boolean) => void;
  readonly libraryCollapsed: boolean;
  readonly setLibraryCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly commandsOpen: boolean;
  readonly setCommandsOpen: (value: boolean) => void;
  readonly pickSourceFile: (() => Promise<PickedFile | null>) | undefined;
}

// eslint-disable-next-line complexity, max-lines-per-function
export function ReaderWorkspaceView({
  model,
}: {
  readonly model: ReaderWorkspaceViewModel;
}): JSX.Element {
  const { library, source, workspace, sourceWorkspace, composer, sourceAddition } = model;
  const shell = useWorkspaceShellPreferences(
    library.sources[0]?.collectionId ?? library.collectionName,
  );
  const [inspectorOpen, setInspectorOpen] = useState(
    () => !window.matchMedia("(max-width: 1120px)").matches,
  );
  useResponsiveInspector(setInspectorOpen);
  const commands = commandsForView(model, () => setInspectorOpen((value) => !value));
  const activeSource = sourceWorkspace.activeSourceId
    ? (library.sources.find(({ id }) => id === sourceWorkspace.activeSourceId) ?? null)
    : null;
  const inspectorSource = activeSource?.id === workspace.selectedSource?.id ? activeSource : null;
  return (
    <div
      className={`reader-shell${model.deploymentUpdateAvailable ? " has-update" : ""}${model.focusChromeVisible ? "" : " is-focus-chrome-hidden"}`}
    >
      {model.deploymentUpdateAvailable ? <DeploymentUpdateNotice /> : null}
      <ReaderHeader
        collectionName={library.collectionName}
        connectionState={library.connectionState}
        theme={model.theme}
        onChangeTheme={model.changeTheme}
        onOpenCommands={() => model.setCommandsOpen(true)}
        onToggleLibrary={() => toggleLibrary(model)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((value) => !value)}
      />
      <main
        className={readerMainClass(
          model.mobileLibraryOpen,
          model.focusMode,
          model.libraryCollapsed,
          inspectorOpen,
        )}
        style={workspaceShellStyle(shell.value)}
      >
        {model.mobileLibraryOpen ? (
          <button
            className="mobile-sheet-dismiss"
            type="button"
            aria-label="Close library"
            onClick={() => model.setMobileLibraryOpen(false)}
          />
        ) : null}
        {inspectorOpen ? (
          <button
            className="mobile-inspector-dismiss"
            type="button"
            aria-label="Close source tools"
            onClick={() => setInspectorOpen(false)}
          />
        ) : null}
        <LibraryNavigator
          sources={library.sources}
          selectedSourceId={source?.id ?? null}
          views={model.libraryViews.views}
          viewsLoading={model.libraryViews.loading}
          problem={model.libraryViews.problem}
          onPreviewSource={(id) => {
            sourceWorkspace.preview(id);
            model.setMobileLibraryOpen(false);
          }}
          onOpenSource={(id) => {
            sourceWorkspace.open(id);
            model.setMobileLibraryOpen(false);
          }}
          onOpenBeside={(id) => sourceWorkspace.openBeside(id)}
          onOpenView={(view) => {
            sourceWorkspace.openLibrary(view.key, view.name);
            model.setMobileLibraryOpen(false);
          }}
          onAddSource={sourceAddition.open}
          addingSource={sourceAddition.adding}
          bibliographyExport={model.bibliographyExport}
        />
        <LibraryResizeHandle onResize={(libraryWidth) => shell.update({ libraryWidth })} />
        <DocumentWorkspace
          sources={library.sources}
          sourceWorkspace={sourceWorkspace}
          focusMode={model.focusMode}
          readingResume={model.readingResume}
          decorationProblem={model.decorationProblem}
          canSelectArea={composer.canSelectArea}
          selectingArea={composer.selectingArea}
          sourceExport={model.sourceExport}
          renderDocument={(openSource, paneId) =>
            model.renderDocument ? (
              <RenderedSourceDocument
                key={`${paneId}:${openSource.id}`}
                sessionId={`${paneId}:${openSource.id}`}
                source={openSource}
                render={model.renderDocument}
                onSurfaceChange={model.onSurfaceChange}
              />
            ) : null
          }
          renderTool={(workspaceTab) => {
            const toolSource = library.sources.find(({ id }) => id === workspaceTab.sourceId);
            return toolSource ? (
              <WorkspaceToolTab
                tab={workspaceTab}
                source={toolSource}
                gateway={model.gateway}
                reconcileSource={workspace.reconcileSource}
                composer={composer}
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
          onBackToLibrary={() => model.setMobileLibraryOpen(true)}
          onToggleFocus={() => model.setFocusMode((value) => !value)}
          onToggleAreaSelection={composer.toggleAreaSelection}
        />
        <InspectorResizeHandle
          dock="right"
          onResize={(inspectorWidth) => shell.update({ inspectorWidth })}
        />
        <InspectorPane
          open={inspectorOpen}
          tab={shell.value.inspectorTab}
          source={inspectorSource}
          paneLabel={`pane ${sourceWorkspace.activePane.id === "primary" ? "A" : "B"}`}
          workspace={workspace}
          composer={composer}
          onClose={() => setInspectorOpen(false)}
          onTabChange={(inspectorTab) => shell.update({ inspectorTab })}
          onPromote={(tab) => {
            if (inspectorSource) {
              sourceWorkspace.openView(inspectorSource.id, tab, sourceWorkspace.activePane.id);
            }
          }}
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

function focusLibrarySearch(): void {
  globalThis.setTimeout(
    () => document.querySelector<HTMLInputElement>("#reader-library-search")?.focus(),
    0,
  );
}

function commandsForView(
  model: ReaderWorkspaceViewModel,
  toggleInspector: () => void,
): ReturnType<typeof readerCommands> {
  return readerCommands({
    sources: model.library.sources,
    activeSource: model.source,
    workspace: model.sourceWorkspace,
    sourceExport: model.sourceExport,
    bibliographyExport: model.bibliographyExport,
    focusMode: model.focusMode,
    toggleFocus: () => model.setFocusMode((value) => !value),
    toggleLibrary: () => toggleLibrary(model),
    toggleInspector,
    searchLibrary: focusLibrarySearch,
  });
}

function toggleLibrary(model: ReaderWorkspaceViewModel): void {
  if (window.matchMedia("(max-width: 680px)").matches) {
    model.setMobileLibraryOpen(!model.mobileLibraryOpen);
    return;
  }
  model.setLibraryCollapsed((value) => !value);
}
