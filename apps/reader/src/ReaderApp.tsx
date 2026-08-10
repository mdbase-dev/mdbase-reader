import { useCallback, useState, type JSX } from "react";

import {
  useReaderAnnotationComposer,
  useReaderReadingResume,
  useReaderShortcuts,
  useResponsiveInspector,
  useStatusFilteredSources,
  useThemePreference,
} from "./reader-app-hooks.js";
import { ReaderLoading } from "./ReaderLoading.js";
import { ReaderWorkspaceView, type ReaderWorkspaceViewModel } from "./ReaderWorkspaceView.js";
import { updateSurface } from "./RenderedSourceDocument.js";
import { useBibliographyExport } from "./use-bibliography-export.js";
import { useDeploymentUpdate } from "./use-deployment-update.js";
import { useDocumentDecorations } from "./use-document-decorations.js";
import { useLibrarySearch } from "./use-library-search.js";
import { useReaderWorkspace, type ReaderWorkspaceController } from "./use-reader-workspace.js";
import { useSessionDocumentSearch } from "./use-session-document-search.js";
import { useSourceAddition } from "./use-source-addition.js";
import { useSourceExport } from "./use-source-export.js";
import { useSourceWorkspace } from "./use-source-workspace.js";

import type { LibraryFilter } from "./LibraryPane.js";
import type { SourceDocumentRenderer } from "./RenderedSourceDocument.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface ReaderAppProps {
  readonly gateway: ReaderWorkspaceGateway;
  readonly renderDocument?: SourceDocumentRenderer;
  readonly pickSourceFile?: () => Promise<PickedFile | null>;
  readonly saveFile?: (name: string, blob: Blob) => Promise<void>;
}

export function ReaderApp({
  gateway,
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
  workspace,
  library,
  renderDocument,
  pickSourceFile,
  saveFile,
}: ReaderAppProps & {
  readonly workspace: ReaderWorkspaceController;
  readonly library: ReaderWorkspaceViewModel["library"];
}): JSX.Element {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [inspectorOpen, setInspectorOpen] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [theme, changeTheme] = useThemePreference();
  const [surfaces, setSurfaces] = useState<ReadonlyMap<SourceId, ReadingSurface>>(new Map());
  const deploymentUpdateAvailable = useDeploymentUpdate();
  const sourceWorkspace = useSourceWorkspace(
    workspace.selectedSource?.id ?? null,
    workspace.selectSource,
  );
  const surface = sourceWorkspace.activeSourceId
    ? (surfaces.get(sourceWorkspace.activeSourceId) ?? null)
    : null;
  const onSurfaceChange = useCallback((sourceId: SourceId, next: ReadingSurface | null): void => {
    setSurfaces((current) => updateSurface(current, sourceId, next));
  }, []);
  const composer = useReaderAnnotationComposer(workspace, surface);
  const readingResume = useReaderReadingResume(workspace, surface);
  const decorationProblem = useDocumentDecorations(surface, workspace.annotations);
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
  useResponsiveInspector(setInspectorOpen);

  useReaderShortcuts(focusMode, setFocusMode);

  const filteredSources = useStatusFilteredSources(workspace.library, filter);
  const documentSearch = useSessionDocumentSearch(workspace.selectedSource, surface, search);
  const librarySearch = useLibrarySearch(gateway, filteredSources, search, documentSearch.matches);

  const source = workspace.selectedSource;
  const openSources = sourceWorkspace.openSourceIds.flatMap((sourceId) => {
    const openSource = library.sources.find(({ id }) => id === sourceId);
    return openSource ? [openSource] : [];
  });
  const model = {
    library,
    source,
    openSources,
    workspace,
    sourceWorkspace,
    composer,
    readingResume,
    decorationProblem,
    librarySearch,
    sourceAddition,
    bibliographyExport,
    sourceExport,
    renderDocument,
    onSurfaceChange,
    deploymentUpdateAvailable,
    theme,
    changeTheme,
    search,
    setSearch,
    filter,
    setFilter,
    focusMode,
    setFocusMode,
    inspectorOpen,
    setInspectorOpen,
    mobileLibraryOpen,
    setMobileLibraryOpen,
    pickSourceFile,
  } satisfies ReaderWorkspaceViewModel;
  return <ReaderWorkspaceView model={model} />;
}
