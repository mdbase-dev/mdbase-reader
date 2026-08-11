import { useMemo, useState, type JSX } from "react";

import { LibraryIcon, PlusIcon, SearchIcon } from "./icons.js";
import { filterSources } from "./workspace-model.js";

import type { MdbaseLibraryView } from "./mdbase-library-views.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";

// eslint-disable-next-line max-lines-per-function
export function LibraryNavigator({
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
}: {
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
}): JSX.Element {
  const [query, setQuery] = useState("");
  const visibleSources = useMemo(() => filterSources(sources, query), [query, sources]);
  const defaultView = views[0];
  return (
    <aside
      id="reader-library-navigator"
      className="library-pane library-navigator"
      aria-label="Library navigator"
    >
      <div className="navigator-heading">
        <button type="button" onClick={() => defaultView && onOpenView(defaultView)}>
          <LibraryIcon />
          <span>
            <strong>Library</strong>
            <small>{String(sources.length)} sources</small>
          </span>
        </button>
        <details className="navigator-actions">
          <summary aria-label="Library actions">•••</summary>
          <div>
            <button
              type="button"
              disabled={bibliographyExport.status === "exporting"}
              onClick={bibliographyExport.run}
            >
              {bibliographyExport.status === "exporting" ? "Preparing…" : "Export bibliography"}
            </button>
          </div>
        </details>
      </div>

      <label className="navigator-search">
        <SearchIcon />
        <span className="sr-only">Find a source</span>
        <input
          id="reader-library-search"
          value={query}
          placeholder="Find a source"
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>⌘F</kbd>
      </label>

      <nav className="navigator-sections" aria-label="Library views and sources">
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

        <section className="navigator-source-section">
          <header>
            <span>{query ? "Matches" : "Sources"}</span>
            <small>{String(visibleSources.length)}</small>
          </header>
          <div role="listbox" aria-label="Sources">
            {visibleSources.map((source) => (
              <button
                key={source.id}
                type="button"
                role="option"
                aria-selected={source.id === selectedSourceId}
                onClick={() => onPreviewSource(source.id)}
                onDoubleClick={() => onOpenSource(source.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onOpenBeside(source.id);
                }}
              >
                <span className={`navigator-format is-${sourceFormat(source)}`}>
                  {sourceFormat(source)}
                </span>
                <span>
                  <strong>{source.title}</strong>
                  <small>{source.creators.join(", ") || "Unknown creator"}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      </nav>

      <div className="navigator-footer">
        <button type="button" disabled={addingSource} onClick={onAddSource}>
          <PlusIcon /> {addingSource ? "Adding…" : "Add source"}
        </button>
      </div>
    </aside>
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
