import { useMemo, useState, type CSSProperties, type JSX, type KeyboardEvent } from "react";

import { DownloadIcon, LibraryIcon, PlusIcon, SearchIcon } from "./icons.js";
import { useVirtualSourceWindow } from "./use-virtual-source-window.js";
import { keyboardSourceIndex } from "./virtual-source-list.js";
import { filterSources } from "./workspace-model.js";

import type { MdbaseLibraryView } from "./mdbase-library-views.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";

const navigatorSourceRowHeight = 50;

interface LibraryNavigatorProps {
  readonly open?: boolean;
  readonly sources: readonly SourceSummary[];
  readonly selectedSourceId: SourceId | null;
  readonly views: readonly MdbaseLibraryView[];
  readonly viewsLoading: boolean;
  readonly problem: string | null;
  readonly addingSource: boolean;
  readonly bibliographyExport: BibliographyExportController;
  readonly onOpenView: (view: MdbaseLibraryView) => void;
  readonly onPreviewSource: (id: SourceId) => void;
  readonly onOpenSource: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
  readonly onAddSource: () => void;
}

export function LibraryNavigator({
  open = true,
  sources,
  selectedSourceId,
  views,
  viewsLoading,
  problem,
  addingSource,
  bibliographyExport,
  onOpenView,
  onPreviewSource,
  onOpenSource,
  onOpenBeside,
  onAddSource,
}: LibraryNavigatorProps): JSX.Element {
  const [query, setQuery] = useState("");
  const visibleSources = useMemo(() => filterSources(sources, query), [query, sources]);
  const defaultView = views[0];
  return (
    <aside
      id="reader-library-navigator"
      className="library-pane library-navigator"
      aria-label="Library navigator"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="navigator-heading">
        <button type="button" onClick={() => defaultView && onOpenView(defaultView)}>
          <LibraryIcon />
          <span>
            <strong>Library</strong>
            <small>{String(sources.length)} sources</small>
          </span>
        </button>
        <button
          className="navigator-export-action"
          type="button"
          disabled={bibliographyExport.status === "exporting"}
          aria-label={
            bibliographyExport.status === "exporting"
              ? "Preparing bibliography export"
              : "Export bibliography"
          }
          title="Export bibliography"
          onClick={bibliographyExport.run}
        >
          <DownloadIcon />
        </button>
        <button
          className="navigator-add-action"
          type="button"
          disabled={addingSource}
          aria-label={addingSource ? "Adding source" : "Add source"}
          title="Add source"
          onClick={onAddSource}
        >
          <PlusIcon />
        </button>
      </div>

      <label className="navigator-search">
        <SearchIcon />
        <span className="sr-only">Find a source by title, author or tag</span>
        <input
          id="reader-library-search"
          value={query}
          placeholder="Title, author or tag"
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>Ctrl/⌘⇧F</kbd>
      </label>

      <nav className="navigator-sections" aria-label="Library views and sources">
        {views.length > 1 || viewsLoading || problem ? (
          <section className="navigator-view-section">
            <header>
              <span>Views</span>
              {viewsLoading ? <small>Loading…</small> : null}
            </header>
            <div>
              {views.map((view) => (
                <button key={view.key} type="button" onClick={() => onOpenView(view)}>
                  <ViewGlyph presentation={view.configuration.presentation} />
                  <span>{view.name}</span>
                  {view.path ? <i aria-label="Saved in mdbase" /> : null}
                </button>
              ))}
            </div>
            {problem ? <p role="alert">{problem}</p> : null}
          </section>
        ) : null}

        <section className={`navigator-source-section${query ? "" : " has-no-heading"}`}>
          {query ? (
            <header>
              <span>Matches</span>
              <small>{String(visibleSources.length)}</small>
            </header>
          ) : null}
          <NavigatorSourceList
            sources={visibleSources}
            selectedSourceId={selectedSourceId}
            resetKey={query}
            onPreviewSource={onPreviewSource}
            onOpenSource={onOpenSource}
            onOpenBeside={onOpenBeside}
          />
        </section>
      </nav>
    </aside>
  );
}

function NavigatorSourceList({
  sources,
  selectedSourceId,
  resetKey,
  onPreviewSource,
  onOpenSource,
  onOpenBeside,
}: {
  readonly sources: readonly SourceSummary[];
  readonly selectedSourceId: SourceId | null;
  readonly resetKey: string;
  readonly onPreviewSource: (id: SourceId) => void;
  readonly onOpenSource: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
}): JSX.Element {
  const { containerRef, range, measure, focusIndex } = useVirtualSourceWindow(
    sources.length,
    resetKey,
    navigatorSourceRowHeight,
  );
  const windowStyle = {
    transform: `translateY(${String(range.offset)}px)`,
  } satisfies CSSProperties;
  const spacerStyle = { height: `${String(range.totalHeight)}px` } satisfies CSSProperties;

  function navigateFrom(event: KeyboardEvent, currentIndex: number): void {
    if (event.key === "Enter") {
      event.preventDefault();
      const source = sources[currentIndex];
      if (source) {
        if (event.ctrlKey || event.metaKey) {
          onOpenBeside(source.id);
        } else {
          onOpenSource(source.id);
        }
      }
      return;
    }
    const nextIndex = keyboardSourceIndex(event.key, currentIndex, sources.length);
    const nextSource = nextIndex === null ? undefined : sources[nextIndex];
    if (nextIndex === null || !nextSource) {
      return;
    }
    event.preventDefault();
    onPreviewSource(nextSource.id);
    focusIndex(nextIndex);
  }

  return (
    <div
      ref={containerRef}
      className="navigator-source-list"
      role="listbox"
      aria-label="Sources"
      onScroll={measure}
    >
      <div className="navigator-source-spacer" style={spacerStyle}>
        <div className="navigator-source-window" style={windowStyle}>
          {sources.slice(range.start, range.end).map((source, relativeIndex) => {
            const index = range.start + relativeIndex;
            const selected = source.id === selectedSourceId;
            return (
              <button
                key={source.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-posinset={index + 1}
                aria-setsize={sources.length}
                data-source-index={index}
                tabIndex={selected || index === range.start ? 0 : -1}
                onClick={() => onPreviewSource(source.id)}
                onDoubleClick={() => onOpenSource(source.id)}
                onKeyDown={(event) => navigateFrom(event, index)}
              >
                <span className={`navigator-format is-${sourceFormat(source)}`}>
                  {sourceFormat(source)}
                </span>
                <span>
                  <strong>{source.title}</strong>
                  <small>{source.creators.join(", ") || "Unknown creator"}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ViewGlyph({ presentation }: { readonly presentation: "table" | "cards" }): JSX.Element {
  return presentation === "cards" ? (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3h12M2 8h12M2 13h12M6 3v10" />
    </svg>
  );
}

function sourceFormat(source: SourceSummary): string {
  const media = source.documents[0]?.mediaType ?? "";
  if (media.includes("pdf")) {
    return "PDF";
  }
  if (media.includes("epub")) {
    return "EPUB";
  }
  if (media.includes("html")) {
    return "WEB";
  }
  return "NOTE";
}
