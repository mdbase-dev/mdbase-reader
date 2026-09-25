import { useCallback, useEffect, useState, type JSX } from "react";

import { navigatorPanelId } from "./dockview-workspace-state.js";
import {
  useReaderAnnotationComposer,
  useFocusChrome,
  useReaderReadingResume,
  useReaderShortcuts,
  useThemePreference,
} from "./reader-app-hooks.js";
import { ReaderLoading } from "./ReaderLoading.js";
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
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReaderDirectAccessController } from "@mdbase-reader/connect";
import type { PickedFile } from "@mdbase-reader/platform";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface ReaderAppProps {
  readonly gateway: ReaderWorkspaceGateway;
  readonly initialSourceId?: string | null;
  readonly directAccess?: ReaderDirectAccessController;
  readonly renderDocument?: SourceDocumentRenderer;
  readonly pickSourceFile?: () => Promise<PickedFile | null>;
  readonly saveFile?: (name: string, blob: Blob) => Promise<void>;
}

export function ReaderApp({
  gateway,
  initialSourceId = null,
  directAccess,
  renderDocument,
  pickSourceFile,
  saveFile,
}: ReaderAppProps): JSX.Element {
  const workspace = useReaderWorkspace(gateway);
  if (workspace.library.status !== "ready") {
    return (
      <ReaderLoading
        error={workspace.library.status === "error" ? workspace.library.message : null}
        onRetry={workspace.retryLibrary}
      />
    );
  }
  return (
    <OpenedReaderApp
      gateway={gateway}
      initialSourceId={initialSourceId}
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
  const collectionKey = library.sources[0]?.collectionId ?? library.collectionName;
  const libraryViews = useMdbaseLibraryViews(gateway);
  const [focusMode, setFocusMode] = useState(false);
  const focusChromeVisible = useFocusChrome(focusMode);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [theme, changeTheme] = useThemePreference();
  const [surfaces, setSurfaces] = useState<ReadonlyMap<string, ReadingSurface>>(new Map());
  const [sessionLocations] = useState(() => new SessionReadingLocations());
  useEffect(() => () => sessionLocations.clear(), [sessionLocations]);
  const deploymentUpdateAvailable = useDeploymentUpdate();
  const directAccessState = useDirectAccess(directAccess);
  const sourceWorkspace = useSourceWorkspace({
    selectedSourceId: workspace.selectedSource?.id ?? null,
    sourceIds: library.sources.map(({ id }) => id),
    collectionKey,
    selectSource: workspace.selectSource,
    confirmDiscard: confirmCloseDirtyTab,
  });
  const surface =
    sourceWorkspace.activeTab?.kind === "source" && sourceWorkspace.activeTab.view === "document"
      ? (surfaces.get(sourceWorkspace.activeTab.id) ?? null)
      : null;
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

  const source = workspace.selectedSource;
  const openSources = sourceWorkspace.openSourceIds.flatMap((sourceId) => {
    const openSource = library.sources.find(({ id }) => id === sourceId);
    return openSource ? [openSource] : [];
  });
  const model = {
    library,
    gateway,
    libraryViews,
    source,
    openSources,
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
    focusChromeVisible,
    setFocusMode,
    commandsOpen,
    setCommandsOpen,
    pickSourceFile,
  } satisfies ReaderWorkspaceViewModel;
  return (
    <SourceLibraryContext value={library.sources}>
      <SourceDeepLink id={initialSourceId} library={library} open={sourceWorkspace.open} />
      <ReaderWorkspaceView model={model} />
    </SourceLibraryContext>
  );
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
