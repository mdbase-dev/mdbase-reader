import { CommandPalette } from "./CommandPalette.js";
import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice.js";
import { DocumentWorkspace } from "./DocumentWorkspace.js";
import { InspectorPane } from "./InspectorPane.js";
import { LibraryPane } from "./LibraryPane.js";
import { InspectorResizeHandle, LibraryResizeHandle } from "./PanelResizeHandle.js";
import { readerMainClass } from "./reader-app-hooks.js";
import { readerCommands } from "./reader-command-list.js";
import { ReaderHeader } from "./ReaderHeader.js";
import { RenderedSourceDocument } from "./RenderedSourceDocument.js";
import { SourceAdditionOverlays } from "./SourceAdditionOverlays.js";
import { useWorkspaceShellPreferences } from "./use-workspace-shell-preferences.js";
import { WorkspaceToolTab } from "./WorkspaceToolTab.js";

import type { LibraryLensId } from "./library-lenses.js";
import type { SourceDocumentRenderer } from "./RenderedSourceDocument.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { LibrarySearchResult } from "./use-library-search.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceAdditionController } from "./use-source-addition.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { WorkspaceShellPreferencesController } from "./use-workspace-shell-preferences.js";
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
  readonly lens: LibraryLensId;
  readonly setLens: (value: LibraryLensId) => void;
  readonly focusMode: boolean;
  readonly setFocusMode: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly inspectorOpen: boolean;
  readonly setInspectorOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly mobileLibraryOpen: boolean;
  readonly setMobileLibraryOpen: (value: boolean) => void;
  readonly commandsOpen: boolean;
  readonly setCommandsOpen: (value: boolean) => void;
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
  const commands = commandsForView(model, shell);
  return (
    <div className={`reader-shell${model.deploymentUpdateAvailable ? " has-update" : ""}`}>
      {model.deploymentUpdateAvailable ? <DeploymentUpdateNotice /> : null}
      <ReaderHeader
        collectionName={library.collectionName}
        connectionState={library.connectionState}
        theme={model.theme}
        onChangeTheme={model.changeTheme}
        onOpenCommands={() => model.setCommandsOpen(true)}
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
          lens={model.lens}
          onSearchChange={model.setSearch}
          onLensChange={model.setLens}
          presentation={shell.value.libraryPresentation}
          onPresentationChange={(libraryPresentation) => shell.update({ libraryPresentation })}
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
        <SourceInspectorRegion model={model} shell={shell} />
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

function SourceInspectorRegion({
  model,
  shell,
}: {
  readonly model: ReaderWorkspaceViewModel;
  readonly shell: WorkspaceShellPreferencesController;
}): JSX.Element {
  return (
    <>
      {model.source ? (
        <InspectorPane
          open={model.inspectorOpen}
          tab={shell.value.inspectorTab}
          workspace={model.workspace}
          composer={model.composer}
          onClose={() => model.setInspectorOpen(false)}
          onTabChange={(inspectorTab) => shell.update({ inspectorTab })}
          dock={shell.value.inspectorDock}
          onDockChange={(inspectorDock) => shell.update({ inspectorDock })}
        />
      ) : null}
      {model.inspectorOpen ? (
        <InspectorResizeHandle
          dock={shell.value.inspectorDock}
          onResize={(size) => resizeInspector(shell, size)}
        />
      ) : null}
    </>
  );
}

function resizeInspector(shell: WorkspaceShellPreferencesController, size: number): void {
  shell.update(
    shell.value.inspectorDock === "right" ? { inspectorWidth: size } : { inspectorHeight: size },
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
  shell: WorkspaceShellPreferencesController,
): ReturnType<typeof readerCommands> {
  return readerCommands({
    sources: model.library.sources,
    activeSource: model.source,
    workspace: model.sourceWorkspace,
    sourceExport: model.sourceExport,
    bibliographyExport: model.bibliographyExport,
    focusMode: model.focusMode,
    inspectorOpen: model.inspectorOpen,
    toggleFocus: () => model.setFocusMode((value) => !value),
    toggleInspector: () => toggleInspector(model),
    toggleLibrary: () => model.setMobileLibraryOpen(!model.mobileLibraryOpen),
    openInspector: (inspectorTab) => {
      shell.update({ inspectorTab });
      model.setInspectorOpen(true);
    },
    searchLibrary: focusLibrarySearch,
  });
}

function shellStyle(preferences: WorkspaceShellPreferences): CSSProperties {
  return {
    "--reader-library-width": `${String(preferences.libraryWidth)}px`,
    "--reader-inspector-width": `${String(preferences.inspectorWidth)}px`,
    "--reader-inspector-height": `${String(preferences.inspectorHeight)}px`,
  } as CSSProperties;
}

function toggleInspector(model: ReaderWorkspaceViewModel): void {
  if (model.focusMode) {
    model.setFocusMode(false);
    model.setInspectorOpen(true);
  } else {
    model.setInspectorOpen((value) => !value);
  }
}
