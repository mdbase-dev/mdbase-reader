import {
  ReaderButton,
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@mdbase-reader/ui";
import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import { DocumentWorkspace } from "./DocumentWorkspace.js";
import { InspectorPane, type InspectorTab } from "./InspectorPane.js";
import { LibraryPane, type LibraryFilter } from "./LibraryPane.js";
import { ReaderHeader } from "./ReaderHeader.js";
import { SourceImportOverlay } from "./SourceImportDialog.js";
import {
  useAnnotationComposer,
  type AnnotationComposerController,
} from "./use-annotation-composer.js";
import { useBibliographyExport } from "./use-bibliography-export.js";
import { useDocumentDecorations } from "./use-document-decorations.js";
import { useLibrarySearch } from "./use-library-search.js";
import { useReaderWorkspace, type ReaderWorkspaceController } from "./use-reader-workspace.js";
import { useReadingResume, type ReadingResumeState } from "./use-reading-resume.js";
import { useSessionDocumentSearch } from "./use-session-document-search.js";
import { useSourceExport } from "./use-source-export.js";
import { useSourceImport } from "./use-source-import.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface ReaderAppProps {
  readonly gateway: ReaderWorkspaceGateway;
  readonly renderDocument?: (
    source: SourceSummary,
    onSurfaceChange: (surface: ReadingSurface | null) => void,
  ) => ReactNode;
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [tab, setTab] = useState<InspectorTab>("annotations");
  const [inspectorOpen, setInspectorOpen] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [theme, changeTheme] = useThemePreference();
  const [surface, setSurface] = useState<ReadingSurface | null>(null);
  const onSurfaceChange = useCallback((next: ReadingSurface | null): void => setSurface(next), []);
  const composer = useReaderAnnotationComposer(workspace, surface);
  const readingResume = useReaderReadingResume(workspace, surface);
  const decorationProblem = useDocumentDecorations(surface, workspace.annotations);
  const sourceImport = useSourceImport(workspace, pickSourceFile, () =>
    setMobileLibraryOpen(false),
  );
  const bibliographyExport = useBibliographyExport(
    workspace.library.status === "ready" ? workspace.library.value.sources : [],
    saveFile,
  );
  const sourceExport = useSourceExport({
    gateway,
    source: workspace.sourceRecord,
    annotations: workspace.annotations,
    citationSources: workspace.library.status === "ready" ? workspace.library.value.sources : [],
    saveFile,
  });

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = (event: MediaQueryListEvent): void => setInspectorOpen(!event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useReaderShortcuts(focusMode, setFocusMode);

  const filteredSources = useStatusFilteredSources(workspace.library, filter);
  const documentSearch = useSessionDocumentSearch(workspace.selectedSource, surface, search);
  const librarySearch = useLibrarySearch(gateway, filteredSources, search, documentSearch.matches);

  if (workspace.library.status !== "ready") {
    return (
      <ReaderLoading
        error={workspace.library.status === "error" ? workspace.library.message : null}
        onRetry={workspace.retryLibrary}
      />
    );
  }

  const library = workspace.library.value;
  const source = workspace.selectedSource;
  return (
    <div className="reader-shell">
      <ReaderHeader
        collectionName={library.collectionName}
        connectionState={library.connectionState}
        theme={theme}
        onChangeTheme={changeTheme}
      />

      <main className={readerMainClass(mobileLibraryOpen, focusMode, inspectorOpen)}>
        <LibraryPane
          sources={library.sources}
          visibleSources={librarySearch.sources}
          selectedSourceId={source?.id ?? null}
          search={search}
          filter={filter}
          onSearchChange={setSearch}
          onFilterChange={setFilter}
          onSelectSource={(id) => {
            workspace.selectSource(id);
            setMobileLibraryOpen(false);
          }}
          onAddSource={() => void sourceImport.choose()}
          addingSource={sourceImport.importing}
          bibliographyExport={bibliographyExport}
          searchMatches={librarySearch.matches}
          searchStatus={librarySearch.status}
          searchProblem={librarySearch.problem}
        />
        <DocumentWorkspace
          source={source}
          document={source ? renderDocument?.(source, onSurfaceChange) : null}
          focusMode={focusMode}
          inspectorOpen={inspectorOpen && !focusMode}
          readingResume={readingResume}
          decorationProblem={decorationProblem}
          canSelectArea={composer.canSelectArea}
          selectingArea={composer.selectingArea}
          sourceExport={sourceExport}
          onBackToLibrary={() => setMobileLibraryOpen(true)}
          onToggleFocus={() => setFocusMode((value) => !value)}
          onToggleAreaSelection={composer.toggleAreaSelection}
          onToggleInspector={() => {
            if (focusMode) {
              setFocusMode(false);
              setInspectorOpen(true);
            } else {
              setInspectorOpen((value) => !value);
            }
          }}
        />
        {source ? (
          <InspectorPane
            open={inspectorOpen}
            tab={tab}
            workspace={workspace}
            composer={composer}
            onClose={() => setInspectorOpen(false)}
            onTabChange={setTab}
          />
        ) : null}
      </main>
      <SourceImportOverlay flow={sourceImport} />
    </div>
  );
}

function useReaderShortcuts(focusMode: boolean, setFocusMode: (value: boolean) => void): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("#reader-library-search")?.focus();
      } else if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [focusMode, setFocusMode]);
}

function useStatusFilteredSources(
  library: ReaderWorkspaceController["library"],
  filter: LibraryFilter,
): readonly SourceSummary[] {
  return useMemo(
    () =>
      library.status === "ready"
        ? library.value.sources.filter(
            ({ readingStatus }) => filter === "all" || readingStatus === filter,
          )
        : [],
    [filter, library],
  );
}

function useThemePreference(): readonly [ThemePreference, () => void] {
  const [theme, setTheme] = useState<ThemePreference>(() => loadThemePreference(localStorage));
  useEffect(() => applyThemePreference(theme, document.documentElement), [theme]);
  const change = (): void => {
    const next = nextTheme(theme);
    saveThemePreference(next, localStorage, document.documentElement);
    setTheme(next);
  };
  return [theme, change];
}

function useReaderReadingResume(
  workspace: ReaderWorkspaceController,
  surface: ReadingSurface | null,
): ReadingResumeState {
  return useReadingResume({
    source: workspace.sourceRecord.status === "ready" ? workspace.sourceRecord.value : null,
    surface,
    save: workspace.saveReadingPosition,
  });
}

function readerMainClass(libraryOpen: boolean, focusMode: boolean, inspectorOpen: boolean): string {
  return [
    "reader-main",
    libraryOpen ? "is-library-open" : "",
    focusMode ? "is-focus-mode" : "",
    !inspectorOpen ? "is-inspector-closed" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function useReaderAnnotationComposer(
  workspace: ReaderWorkspaceController,
  surface: ReadingSurface | null,
): AnnotationComposerController {
  return useAnnotationComposer({
    source: workspace.selectedSource,
    surface,
    create: workspace.createAnnotation,
  });
}

function ReaderLoading({
  error,
  onRetry,
}: {
  readonly error: string | null;
  readonly onRetry: () => void;
}): JSX.Element {
  if (!error) {
    return (
      <div className="reader-loading" role="status">
        Opening your reading collection…
      </div>
    );
  }
  return (
    <div className="reader-loading is-error" role="alert">
      <p>{error}</p>
      <ReaderButton onClick={onRetry}>Try again</ReaderButton>
    </div>
  );
}

function nextTheme(theme: ThemePreference): ThemePreference {
  if (theme === "system") {
    return "light";
  }
  return theme === "light" ? "dark" : "system";
}
