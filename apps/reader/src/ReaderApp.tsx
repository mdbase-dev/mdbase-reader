import { OpeningScreen } from "@mdbase-dev/ui/screens";
import { sourceId } from "@mdbase-reader/core";
import { useCallback, useEffect, useState, type JSX } from "react";

import { navigatorPanelId } from "./dockview-workspace-state.js";
import {
  useDocumentSurfaceTiming,
  useReaderAnnotationComposer,
  useReaderReadingResume,
  useReaderShortcuts,
  useThemePreference,
} from "./reader-app-hooks.js";
import { ReaderWorkspaceView, type ReaderWorkspaceViewModel } from "./ReaderWorkspaceView.js";
import { updateSurface } from "./RenderedSourceDocument.js";
import { SessionReadingLocations } from "./session-reading-locations.js";
import { SourceDeepLink } from "./SourceDeepLink.js";
import { SourceLibraryContext } from "./SourceLibraryContext.js";
import { useBibliographyExport } from "./use-bibliography-export.js";
import { useDeploymentUpdate } from "./use-deployment-update.js";
import { useDirectAccess } from "./use-direct-access.js";
import { useDocumentAttachment } from "./use-document-attachment.js";
import { useDocumentDecorations } from "./use-document-decorations.js";
import { useMdbaseLibraryViews } from "./use-mdbase-library-views.js";
import { useReaderWorkspace, type ReaderWorkspaceController } from "./use-reader-workspace.js";
import { useSourceAddition } from "./use-source-addition.js";
import { useSourceExport } from "./use-source-export.js";
import { useSourceWorkspace } from "./use-source-workspace.js";

import type { SourceDocumentRenderer } from "./RenderedSourceDocument.js";
import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReaderDirectAccessController } from "@mdbase-reader/connect";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface ReaderAppProps {
  readonly gateway: ReaderWorkspaceGateway;
  readonly initialSourceId?: string | null;
  /** An annotation of the initial source to reveal (its record path or id). */
  readonly initialAnnotation?: string | null;
  readonly directAccess?: ReaderDirectAccessController;
  readonly renderDocument?: SourceDocumentRenderer;
  readonly pickSourceFile?: () => Promise<PickedFile | null>;
  readonly saveFile?: (name: string, blob: Blob) => Promise<void>;
}

export function ReaderApp({
  gateway,
  initialSourceId = null,
  initialAnnotation = null,
  directAccess,
  renderDocument,
  pickSourceFile,
  saveFile,
}: ReaderAppProps): JSX.Element {
  const workspace = useReaderWorkspace(gateway, initialSourceId ? sourceId(initialSourceId) : null);
  if (workspace.library.status !== "ready") {
    return (
      <OpeningScreen
        app="reader"
        title="Opening your reading collection"
        detail="Loading the first sources; the rest of the library will load in the background"
        error={workspace.library.status === "error" ? workspace.library.message : null}
        onRetry={workspace.retryLibrary}
      />
    );
  }
  return (
    <OpenedReaderApp
      gateway={gateway}
      initialSourceId={initialSourceId}
      initialAnnotation={initialAnnotation}
      {...(directAccess ? { directAccess } : {})}
      workspace={workspace}
      library={workspace.library.value}
      {...(renderDocument ? { renderDocument } : {})}
      {...(pickSourceFile ? { pickSourceFile } : {})}
      {...(saveFile ? { saveFile } : {})}
    />
  );
}

function OpenedReaderApp({
  gateway,
  initialSourceId = null,
  initialAnnotation = null,
  directAccess,
  workspace,
  library,
  renderDocument,
  pickSourceFile,
  saveFile,
}: ReaderAppProps & {
  readonly workspace: ReaderWorkspaceController;
  readonly library: ReaderWorkspaceViewModel["library"];
}): JSX.Element {
  const [focusMode, setFocusMode] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [theme, changeTheme] = useThemePreference();
  const [surfaces, setSurfaces] = useState<ReadonlyMap<string, ReadingSurface>>(new Map());
  const [sessionLocations] = useState(() => new SessionReadingLocations());
  useEffect(() => () => sessionLocations.clear(), [sessionLocations]);
  const deploymentUpdateAvailable = useDeploymentUpdate();
  const directAccessState = useDirectAccess(directAccess);
  const sourceWorkspace = useRestoredSourceWorkspace(workspace, library);
  const libraryViews = useMdbaseLibraryViews(
    gateway,
    library.sourceIndex?.complete !== false ||
      (!initialSourceId && !sourceWorkspace.activeSourceId) ||
      workspace.sourceRecord.status === "ready",
  );
  const surface =
    sourceWorkspace.activeTab?.kind === "source" && sourceWorkspace.activeTab.view === "document"
      ? (surfaces.get(sourceWorkspace.activeTab.id) ?? null)
      : null;
  useDocumentSurfaceTiming(sourceWorkspace.activeTab?.id ?? null, surface);
  const onSurfaceChange = useCallback(
    (sessionId: string, next: ReadingSurface | null): void => {
      sessionLocations.attach(sessionId, next);
      setSurfaces((current) => updateSurface(current, sessionId, next));
    },
    [sessionLocations],
  );
  const composer = useReaderAnnotationComposer(workspace, sourceWorkspace.activeSourceId, surface);
  const readingResume = useReaderReadingResume(workspace, surface);
  const decorationProblem = useDocumentDecorations(
    surface,
    workspace.annotations,
    composer.activeAnnotationId,
  );
  const sourceAddition = useSourceAddition(workspace, pickSourceFile, (sourceId) => {
    sourceWorkspace.open(sourceId);
  });
  const documentAttachment = useDocumentAttachment(workspace, pickSourceFile);
  const bibliographyExport = useBibliographyExport(library.sources, saveFile);
  const sourceExport = useSourceExport({
    gateway,
    source: workspace.sourceRecord,
    annotations: workspace.annotations,
    citationSources: library.sources,
    saveFile,
  });

  useReaderShortcuts({
    focusMode,
    setFocusMode,
    openCommands: () => setCommandsOpen(true),
    focusSearch: () => {
      sourceWorkspace.dock.setSideVisible(navigatorPanelId, true);
      focusLibrarySearch();
    },
    switchTab: sourceWorkspace.switchRelative,
    focusNextPane: sourceWorkspace.focusNextPane,
    reopenTab: sourceWorkspace.reopenClosed,
    navigate: sourceWorkspace.navigate,
    toggleSidebar: () => sourceWorkspace.dock.toggleSidebar("left"),
    toggleNotes: () => sourceWorkspace.dock.toggleSidebar("right"),
  });

  const model = {
    library,
    gateway,
    libraryViews,
    source: workspace.selectedSource,
    openSources: openSourcesOf(library.sources, sourceWorkspace.openSourceIds),
    workspace,
    sourceWorkspace,
    composer,
    readingResume,
    decorationProblem,
    sourceAddition,
    documentAttachment,
    bibliographyExport,
    sourceExport,
    renderDocument,
    onSurfaceChange,
    surfaces,
    deploymentUpdateAvailable,
    directAccess: directAccessState,
    theme,
    changeTheme,
    focusMode,
    setFocusMode,
    commandsOpen,
    setCommandsOpen,
    pickSourceFile,
  } satisfies ReaderWorkspaceViewModel;
  return (
    <SourceLibraryContext value={library.sources}>
      <SourceDeepLink
        id={initialSourceId}
        annotation={initialAnnotation}
        library={library}
        open={sourceWorkspace.open}
        activeSourceId={sourceWorkspace.activeSourceId}
        annotations={workspace.annotations}
        openAnnotation={composer.open}
      />
      <ReaderWorkspaceView model={model} />
    </SourceLibraryContext>
  );
}

/** The open tabs' sources, in tab order, leaving out any no longer in the library. */
function openSourcesOf(
  sources: readonly SourceSummary[],
  openIds: readonly SourceId[],
): SourceSummary[] {
  return openIds.flatMap((sourceId) => sources.filter(({ id }) => id === sourceId));
}

function useRestoredSourceWorkspace(
  workspace: ReaderWorkspaceController,
  library: ReaderLibrarySnapshot,
): ReturnType<typeof useSourceWorkspace> {
  return useSourceWorkspace({
    selectedSourceId: workspace.selectedSource?.id ?? null,
    sourceIds: library.sources.map(({ id }) => id),
    collectionKey: library.sources[0]?.collectionId ?? library.collectionName,
    sourceIndexComplete: library.sourceIndex?.complete !== false,
    selectSource: workspace.selectSource,
    confirmDiscard: confirmCloseDirtyTab,
  });
}

function confirmCloseDirtyTab(): boolean {
  // Native confirmation keeps tab and pane closing synchronous with the workspace action.
  // eslint-disable-next-line no-alert
  return globalThis.confirm(
    "Close this tab with unsaved changes? Keep it open until saving finishes to avoid losing work.",
  );
}

function focusLibrarySearch(): void {
  globalThis.setTimeout(
    () => document.querySelector<HTMLInputElement>("#reader-library-search")?.focus(),
    0,
  );
}
