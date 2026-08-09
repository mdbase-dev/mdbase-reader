import {
  ProductBrand,
  ReaderButton,
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@mdbase-reader/ui";
import { useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import { DocumentWorkspace } from "./DocumentWorkspace.js";
import { ThemeIcon } from "./icons.js";
import { InspectorPane, type InspectorTab } from "./InspectorPane.js";
import { LibraryPane } from "./LibraryPane.js";
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
  const [tab, setTab] = useState<InspectorTab>("annotations");
  const [inspectorOpen, setInspectorOpen] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => loadThemePreference(localStorage));

  useEffect(() => applyThemePreference(theme, document.documentElement), [theme]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = (event: MediaQueryListEvent): void => setInspectorOpen(!event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const visibleSources = useMemo(
    () =>
      filterSources(
        workspace.library.status === "ready" ? workspace.library.value.sources : [],
        search,
      ),
    [search, workspace.library],
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
      <header className="reader-header">
        <ProductBrand />
        <div className="reader-header-context">
          <span>{library.collectionName}</span>
          <i aria-hidden="true" />
          <span className={`connection-state is-${library.connectionState}`}>
            {library.connectionState}
          </span>
        </div>
        <div className="reader-header-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={`Theme: ${theme}. Change theme`}
            onClick={changeTheme}
          >
            <ThemeIcon />
          </button>
          <button
            className="profile-button"
            type="button"
            aria-label="Account and collection settings"
          >
            CB
          </button>
        </div>
      </header>

      <main className={mobileLibraryOpen ? "reader-main is-library-open" : "reader-main"}>
        <LibraryPane
          sources={library.sources}
          visibleSources={visibleSources}
          selectedSourceId={source?.id ?? null}
          search={search}
          onSearchChange={setSearch}
          onSelectSource={(id) => {
            workspace.selectSource(id);
            setMobileLibraryOpen(false);
          }}
        />
        <DocumentWorkspace
          source={source}
          document={source ? renderDocument?.(source) : null}
          onBackToLibrary={() => setMobileLibraryOpen(true)}
          onOpenInspector={() => setInspectorOpen(true)}
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
