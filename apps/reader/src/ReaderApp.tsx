import {
  ReaderButton,
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@mdbase-reader/ui";
import { useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import { DocumentWorkspace } from "./DocumentWorkspace.js";
import { InspectorPane, type InspectorTab } from "./InspectorPane.js";
import { LibraryPane, type LibraryFilter } from "./LibraryPane.js";
import { ReaderHeader } from "./ReaderHeader.js";
import { useReaderWorkspace } from "./use-reader-workspace.js";
import { filterSources, type ReaderWorkspaceGateway } from "./workspace-model.js";

import type { SourceSummary } from "@mdbase-reader/core";

export interface ReaderAppProps {
  readonly gateway: ReaderWorkspaceGateway;
  readonly renderDocument?: (source: SourceSummary) => ReactNode;
}

export function ReaderApp({ gateway, renderDocument }: ReaderAppProps): JSX.Element {
  const workspace = useReaderWorkspace(gateway);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [tab, setTab] = useState<InspectorTab>("annotations");
  const [inspectorOpen, setInspectorOpen] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => loadThemePreference(localStorage));

  useEffect(() => applyThemePreference(theme, document.documentElement), [theme]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = (event: MediaQueryListEvent): void => setInspectorOpen(!event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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
  }, [focusMode]);

  const visibleSources = useMemo(
    () =>
      filterSources(
        workspace.library.status === "ready"
          ? workspace.library.value.sources.filter(
              ({ readingStatus }) => filter === "all" || readingStatus === filter,
            )
          : [],
        search,
      ),
    [filter, search, workspace.library],
  );

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
  const changeTheme = (): void => {
    const next = nextTheme(theme);
    saveThemePreference(next, localStorage, document.documentElement);
    setTheme(next);
  };

  return (
    <div className="reader-shell">
      <ReaderHeader
        collectionName={library.collectionName}
        connectionState={library.connectionState}
        theme={theme}
        onChangeTheme={changeTheme}
      />

      <main
        className={[
          "reader-main",
          mobileLibraryOpen ? "is-library-open" : "",
          focusMode ? "is-focus-mode" : "",
          !inspectorOpen ? "is-inspector-closed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <LibraryPane
          sources={library.sources}
          visibleSources={visibleSources}
          selectedSourceId={source?.id ?? null}
          search={search}
          filter={filter}
          onSearchChange={setSearch}
          onFilterChange={setFilter}
          onSelectSource={(id) => {
            workspace.selectSource(id);
            setMobileLibraryOpen(false);
          }}
        />
        <DocumentWorkspace
          source={source}
          document={source ? renderDocument?.(source) : null}
          focusMode={focusMode}
          inspectorOpen={inspectorOpen && !focusMode}
          onBackToLibrary={() => setMobileLibraryOpen(true)}
          onToggleFocus={() => setFocusMode((value) => !value)}
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
            onClose={() => setInspectorOpen(false)}
            onTabChange={setTab}
          />
        ) : null}
      </main>
    </div>
  );
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
