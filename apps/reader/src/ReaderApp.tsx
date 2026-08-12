import { useCallback, useState, type JSX } from "react";

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
import { useBibliographyExport } from "./use-bibliography-export.js";
import { useDeploymentUpdate } from "./use-deployment-update.js";
import { useDirectAccess } from "./use-direct-access.js";
import { useDocumentDecorations } from "./use-document-decorations.js";
import { useMdbaseLibraryViews } from "./use-mdbase-library-views.js";
import { useReaderWorkspace, type ReaderWorkspaceController } from "./use-reader-workspace.js";
import { useSourceAddition } from "./use-source-addition.js";
import { useSourceExport } from "./use-source-export.js";
import { useSourceWorkspace } from "./use-source-workspace.js";
import { useWorkspaceDirtyIndicator } from "./use-workspace-dirty-indicator.js";

import type { SourceDocumentRenderer } from "./RenderedSourceDocument.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReaderDirectAccessController } from "@mdbase-reader/connect";
import type { PickedFile } from "@mdbase-reader/platform";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface ReaderAppProps {
  readonly gateway: ReaderWorkspaceGateway;
  readonly directAccess?: ReaderDirectAccessController;
  readonly renderDocument?: SourceDocumentRenderer;
  readonly pickSourceFile?: () => Promise<PickedFile | null>;
  readonly saveFile?: (name: string, blob: Blob) => Promise<void>;
}

export function ReaderApp({
  gateway,
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
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const focusChromeVisible = useFocusChrome(focusMode);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [theme, changeTheme] = useThemePreference();
  const [surfaces, setSurfaces] = useState<ReadonlyMap<string, ReadingSurface>>(new Map());
  const deploymentUpdateAvailable = useDeploymentUpdate();
  const directAccessState = useDirectAccess(directAccess);
  const sourceWorkspace = useSourceWorkspace({
    selectedSourceId: workspace.selectedSource?.id ?? null,
    sourceIds: library.sources.map(({ id }) => id),
    collectionKey,
    selectSource: workspace.selectSource,
    // Native confirmation keeps tab and pane closing synchronous with the workspace action.
    // eslint-disable-next-line no-alert
    confirmDiscard: () => globalThis.confirm("Discard unsaved changes and close this tab?"),
  });
  const surface = sourceWorkspace.activeSourceId
    ? (surfaces.get(`${sourceWorkspace.layout.focusedPaneId}:${sourceWorkspace.activeSourceId}`) ??
      null)
    : null;
  const onSurfaceChange = useCallback((sessionId: string, next: ReadingSurface | null): void => {
    setSurfaces((current) => updateSurface(current, sessionId, next));
  }, []);
  const composer = useReaderAnnotationComposer(workspace, surface);
  useWorkspaceDirtyIndicator(workspace, sourceWorkspace);
  const readingResume = useReaderReadingResume(workspace, surface);
  const decorationProblem = useDocumentDecorations(
    surface,
    workspace.annotations,
    composer.activeAnnotationId,
  );
  const sourceAddition = useSourceAddition(workspace, pickSourceFile, (sourceId) => {
    sourceWorkspace.open(sourceId);
    setMobileLibraryOpen(false);
  });
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
    focusSearch: () => focusLibrarySearch(setMobileLibraryOpen),
    switchTab: sourceWorkspace.switchRelative,
    focusNextPane: sourceWorkspace.focusNextPane,
    reopenTab: sourceWorkspace.reopenClosed,
    navigate: sourceWorkspace.navigate,
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
    bibliographyExport,
    sourceExport,
    renderDocument,
    onSurfaceChange,
    deploymentUpdateAvailable,
    directAccess: directAccessState,
    theme,
    changeTheme,
    focusMode,
    focusChromeVisible,
    setFocusMode,
    mobileLibraryOpen,
    setMobileLibraryOpen,
    libraryCollapsed,
    setLibraryCollapsed,
    commandsOpen,
    setCommandsOpen,
    pickSourceFile,
  } satisfies ReaderWorkspaceViewModel;
  return <ReaderWorkspaceView model={model} />;
}

function focusLibrarySearch(setLibraryOpen: (open: boolean) => void): void {
  setLibraryOpen(true);
  globalThis.setTimeout(
    () => document.querySelector<HTMLInputElement>("#reader-library-search")?.focus(),
    0,
  );
}
