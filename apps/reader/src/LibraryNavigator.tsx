import { useMemo, useState, type CSSProperties, type JSX, type KeyboardEvent } from "react";

import { SearchIcon } from "./icons.js";
import { shortcutLabel } from "./Menu.js";
import {
  NavigatorFooter,
  NavigatorShortList,
  recentSources,
  sourceFormat,
} from "./NavigatorSections.js";
import { useVirtualSourceWindow } from "./use-virtual-source-window.js";
import { keyboardSourceIndex } from "./virtual-source-list.js";
import { filterSources } from "./workspace-model.js";

import type { MdbaseLibraryView } from "./mdbase-library-views.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";

const navigatorSourceRowHeight = 50;

interface LibraryNavigatorProps {
  readonly open?: boolean;
  readonly sources: readonly SourceSummary[];
  readonly openSources?: readonly SourceSummary[];
  readonly selectedSourceId: SourceId | null;
  readonly views: readonly MdbaseLibraryView[];
  readonly viewsLoading: boolean;
  readonly problem: string | null;
  readonly addingSource: boolean;
  readonly onOpenView: (view: MdbaseLibraryView) => void;
  readonly onPreviewSource: (id: SourceId) => void;
  readonly onOpenSource: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
  readonly onAddSource: () => void;
}

export function LibraryNavigator({
  open = true,
  sources,
  openSources = [],
  selectedSourceId,
  views,
  viewsLoading,
  problem,
  addingSource,
  onOpenView,
  onPreviewSource,
  onOpenSource,
  onOpenBeside,
  onAddSource,
}: LibraryNavigatorProps): JSX.Element {
  const [query, setQuery] = useState("");
  const visibleSources = useMemo(() => filterSources(sources, query), [query, sources]);
  // The open list is rebuilt on every workspace render; its identities are what matter.
  const openKey = openSources.map(({ id }) => id).join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recent = useMemo(() => recentSources(sources, openSources), [openKey, sources]);
  const rowProps = { selectedSourceId, onPreviewSource, onOpenSource, onOpenBeside };
  return (
    <aside
      id="reader-library-navigator"
      className="library-pane library-navigator"
      aria-label="Library navigator"
      aria-hidden={!open}
      inert={!open}
    >
      <label className="navigator-search">
        <SearchIcon />
        <span className="sr-only">Find a source by title, author or tag</span>
        <input
          id="reader-library-search"
          value={query}
          placeholder="Find a source"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.stopPropagation();
              setQuery("");
            }
          }}
        />
        <kbd>{shortcutLabel("mod+shift+f")}</kbd>
      </label>

      <nav className="navigator-sections" aria-label="Library views and sources">
        {query ? null : (
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
                </button>
              ))}
            </div>
            {problem ? <p role="alert">{problem}</p> : null}
          </section>
        )}

        {query ? (
          <section className="navigator-source-section">
            <header>
              <span>Matches</span>
              <small>{String(visibleSources.length)}</small>
            </header>
            {visibleSources.length === 0 ? (
              <p className="navigator-empty">No sources match.</p>
            ) : (
              <NavigatorSourceList
                sources={visibleSources}
                selectedSourceId={selectedSourceId}
                resetKey={query}
                onPreviewSource={onPreviewSource}
                onOpenSource={onOpenSource}
                onOpenBeside={onOpenBeside}
              />
            )}
          </section>
        ) : (
          <>
            {openSources.length > 0 ? (
              <NavigatorShortList label="Open" sources={openSources} {...rowProps} />
            ) : null}
            {recent.length > 0 ? (
              <NavigatorShortList label="Recent" sources={recent} {...rowProps} />
            ) : null}
            {sources.length === 0 ? (
              <p className="navigator-empty">
                No sources yet.{" "}
                <button type="button" className="navigator-inline-action" onClick={onAddSource}>
                  Add one
                </button>
              </p>
            ) : null}
          </>
        )}
      </nav>
      <NavigatorFooter addingSource={addingSource} onAddSource={onAddSource} />
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
