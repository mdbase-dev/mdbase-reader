import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice.js";
import { DocumentWorkspace } from "./DocumentWorkspace.js";
import { InspectorContent, InspectorPane } from "./InspectorPane.js";
import { LibraryPane, type LibraryFilter } from "./LibraryPane.js";
import { InspectorResizeHandle, LibraryResizeHandle } from "./PanelResizeHandle.js";
import { readerMainClass } from "./reader-app-hooks.js";
import { ReaderHeader } from "./ReaderHeader.js";
import { RenderedSourceDocument } from "./RenderedSourceDocument.js";
import { SourceAdditionOverlays } from "./SourceAdditionOverlays.js";
import { useWorkspaceShellPreferences } from "./use-workspace-shell-preferences.js";

import type { SourceDocumentRenderer } from "./RenderedSourceDocument.js";
import type { WorkspaceTab } from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { LibrarySearchResult } from "./use-library-search.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceAdditionController } from "./use-source-addition.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { ReaderLibrarySnapshot } from "./workspace-model.js";
import type { WorkspaceShellPreferences } from "./workspace-shell-preferences.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";
import type { ThemePreference } from "@mdbase-reader/ui";
import type { CSSProperties, JSX } from "react";

export interface ReaderWorkspaceViewModel {
  readonly library: ReaderLibrarySnapshot;
  readonly source: SourceSummary | null;
  readonly openSources: readonly SourceSummary[];
  readonly workspace: ReaderWorkspaceController;
  readonly sourceWorkspace: SourceWorkspaceController;
  readonly composer: AnnotationComposerController;
  readonly readingResume: ReadingResumeState;
  readonly decorationProblem: string | null;
  readonly librarySearch: LibrarySearchResult;
  readonly sourceAddition: SourceAdditionController;
  readonly bibliographyExport: BibliographyExportController;
  readonly sourceExport: SourceExportController;
  readonly renderDocument: SourceDocumentRenderer | undefined;
  readonly onSurfaceChange: (sessionId: string, surface: ReadingSurface | null) => void;
  readonly deploymentUpdateAvailable: boolean;
  readonly theme: ThemePreference;
  readonly changeTheme: () => void;
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly filter: LibraryFilter;
  readonly setFilter: (value: LibraryFilter) => void;
  readonly focusMode: boolean;
  readonly setFocusMode: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly inspectorOpen: boolean;
  readonly setInspectorOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly mobileLibraryOpen: boolean;
  readonly setMobileLibraryOpen: (value: boolean) => void;
  readonly pickSourceFile: (() => Promise<PickedFile | null>) | undefined;
}

export function ReaderWorkspaceView({
  model,
}: {
  readonly model: ReaderWorkspaceViewModel;
}): JSX.Element {
  const { library, source, workspace, sourceWorkspace, composer, sourceAddition, librarySearch } =
    model;
  const shell = useWorkspaceShellPreferences(
    library.sources[0]?.collectionId ?? library.collectionName,
  );
  return (
    <div className={`reader-shell${model.deploymentUpdateAvailable ? " has-update" : ""}`}>
      {model.deploymentUpdateAvailable ? <DeploymentUpdateNotice /> : null}
      <ReaderHeader
        collectionName={library.collectionName}
        connectionState={library.connectionState}
        theme={model.theme}
        onChangeTheme={model.changeTheme}
      />
      <main
        className={`${readerMainClass(model.mobileLibraryOpen, model.focusMode, model.inspectorOpen)} is-inspector-${shell.value.inspectorDock}`}
        style={shellStyle(shell.value)}
      >
        <LibraryPane
          sources={library.sources}
          visibleSources={librarySearch.sources}
          selectedSourceId={source?.id ?? null}
          search={model.search}
          filter={model.filter}
          onSearchChange={model.setSearch}
          onFilterChange={model.setFilter}
          onSelectSource={(id) => {
            sourceWorkspace.preview(id);
            model.setMobileLibraryOpen(false);
          }}
          onOpenSource={(id) => {
            sourceWorkspace.open(id);
            model.setMobileLibraryOpen(false);
          }}
          onOpenBeside={(id) => sourceWorkspace.openBeside(id)}
          onAddSource={sourceAddition.open}
          addingSource={sourceAddition.adding}
          bibliographyExport={model.bibliographyExport}
          searchMatches={librarySearch.matches}
          searchStatus={librarySearch.status}
          searchProblem={librarySearch.problem}
          sourceIndex={library.sourceIndex}
        />
        <LibraryResizeHandle onResize={(libraryWidth) => shell.update({ libraryWidth })} />
        <DocumentWorkspace
          sources={library.sources}
          sourceWorkspace={sourceWorkspace}
          focusMode={model.focusMode}
          inspectorOpen={model.inspectorOpen && !model.focusMode}
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
          renderTool={(workspaceTab, focused) => (
            <WorkspaceToolTab
              tab={workspaceTab}
              focused={focused}
              source={source}
              workspace={workspace}
              sourceWorkspace={sourceWorkspace}
              composer={composer}
            />
          )}
          onAddSource={sourceAddition.open}
          onBackToLibrary={() => model.setMobileLibraryOpen(true)}
          onToggleFocus={() => model.setFocusMode((value) => !value)}
          onToggleAreaSelection={composer.toggleAreaSelection}
          onToggleInspector={() => toggleInspector(model)}
        />
        {source ? (
          <InspectorPane
            open={model.inspectorOpen}
            tab={shell.value.inspectorTab}
            workspace={workspace}
            composer={composer}
            onClose={() => model.setInspectorOpen(false)}
            onTabChange={(inspectorTab) => shell.update({ inspectorTab })}
            dock={shell.value.inspectorDock}
            onDockChange={(inspectorDock) => shell.update({ inspectorDock })}
          />
        ) : null}
        {model.inspectorOpen ? (
          <InspectorResizeHandle
            dock={shell.value.inspectorDock}
            onResize={(size) =>
              shell.update(
                shell.value.inspectorDock === "right"
                  ? { inspectorWidth: size }
                  : { inspectorHeight: size },
              )
            }
          />
        ) : null}
      </main>
      <SourceAdditionOverlays
        addition={sourceAddition}
        canChooseFile={Boolean(model.pickSourceFile)}
      />
    </div>
  );
}

function shellStyle(preferences: WorkspaceShellPreferences): CSSProperties {
  return {
    "--reader-library-width": `${String(preferences.libraryWidth)}px`,
    "--reader-inspector-width": `${String(preferences.inspectorWidth)}px`,
    "--reader-inspector-height": `${String(preferences.inspectorHeight)}px`,
  } as CSSProperties;
}

function WorkspaceToolTab({
  tab,
  focused,
  source,
  workspace,
  sourceWorkspace,
  composer,
}: {
  readonly tab: WorkspaceTab;
  readonly focused: boolean;
  readonly source: SourceSummary | null;
  readonly workspace: ReaderWorkspaceController;
  readonly sourceWorkspace: SourceWorkspaceController;
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  if (focused && source?.id === tab.sourceId) {
    return (
      <div className="workspace-tool-surface">
        <InspectorContent
          tab={tab.view === "document" ? "annotations" : tab.view}
          workspace={workspace}
          composer={composer}
        />
      </div>
    );
  }
  const paneId =
    sourceWorkspace.layout.panes.find(({ tabs }) => tabs.some(({ id }) => id === tab.id))?.id ??
    "primary";
  return (
    <button
      className="workspace-tool-activate"
      type="button"
      onClick={() => sourceWorkspace.focus(paneId)}
    >
      Activate this pane to load {tab.view}.
    </button>
  );
}

function toggleInspector(model: ReaderWorkspaceViewModel): void {
  if (model.focusMode) {
    model.setFocusMode(false);
    model.setInspectorOpen(true);
  } else {
    model.setInspectorOpen((value) => !value);
  }
}
