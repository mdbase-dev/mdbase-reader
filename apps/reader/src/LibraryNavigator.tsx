import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, type JSX } from "react";

import { NavigatorFooter, NavigatorShortList, recentSources } from "./NavigatorSections.js";
import { sourcesById } from "./source-creators.js";

import type { MdbaseLibraryView } from "./mdbase-library-views.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";

interface LibraryNavigatorProps {
  readonly open?: boolean;
  readonly sources: readonly SourceSummary[];
  readonly openSources?: readonly SourceSummary[];
  readonly selectedSourceId: SourceId | null;
  readonly views: readonly MdbaseLibraryView[];
  readonly viewsLoading: boolean;
  readonly indexLoading?: boolean;
  readonly problem: string | null;
  readonly addingSource: boolean;
  /** The library tab already shows what to continue, so the rail need not repeat it. */
  readonly hideRecent?: boolean;
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
  indexLoading = false,
  problem,
  addingSource,
  hideRecent = false,
  onOpenView,
  onPreviewSource,
  onOpenSource,
  onOpenBeside,
  onAddSource,
}: LibraryNavigatorProps): JSX.Element {
  const { t } = useLingui();
  // The open list is rebuilt on every workspace render; its identities are what matter.
  const openKey = openSources.map(({ id }) => id).join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recent = useMemo(() => recentSources(sources, openSources), [openKey, sources]);
  const library = useMemo(() => sourcesById(sources), [sources]);
  const rowProps = { library, selectedSourceId, onPreviewSource, onOpenSource, onOpenBeside };
  return (
    <aside
      id="reader-library-navigator"
      className="library-pane library-navigator"
      aria-label={translate({ message: "Sources sidebar" })}
      aria-hidden={!open}
      inert={!open}
    >
      <nav className="navigator-sections" aria-label={t({ message: "Library views and sources" })}>
        <NavigatorViews
          views={views}
          viewsLoading={viewsLoading}
          problem={problem}
          onOpenView={onOpenView}
        />
        {openSources.length > 0 ? (
          <NavigatorShortList
            label={t({ message: "Open", context: "LibraryNavigator interface" })}
            sources={openSources}
            {...rowProps}
          />
        ) : null}
        {recent.length > 0 && !hideRecent ? (
          <NavigatorShortList
            label={t({ message: "Recent", context: "LibraryNavigator interface" })}
            sources={recent}
            {...rowProps}
          />
        ) : null}
        <NavigatorEmptySources sources={sources} loading={indexLoading} onAddSource={onAddSource} />
      </nav>
      <NavigatorFooter addingSource={addingSource} onAddSource={onAddSource} />
    </aside>
  );
}

function NavigatorViews({
  views,
  viewsLoading,
  problem,
  onOpenView,
}: Pick<LibraryNavigatorProps, "views" | "viewsLoading" | "problem" | "onOpenView">): JSX.Element {
  return (
    <section className="navigator-view-section">
      <header>
        <span>
          <Trans>Views</Trans>
        </span>
        {viewsLoading ? (
          <small>
            <Trans>Loading…</Trans>
          </small>
        ) : null}
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
  );
}

function NavigatorEmptySources({
  sources,
  loading,
  onAddSource,
}: Pick<LibraryNavigatorProps, "sources" | "onAddSource"> & {
  readonly loading: boolean;
}): JSX.Element | null {
  if (sources.length !== 0) {
    return null;
  }
  if (loading) {
    return (
      <p className="navigator-empty" role="status">
        <Trans>Loading sources…</Trans>
      </p>
    );
  }
  return (
    <p className="navigator-empty">
      <Trans>No sources yet.</Trans>{" "}
      <button type="button" className="navigator-inline-action" onClick={onAddSource}>
        <Trans>Add one</Trans>
      </button>
    </p>
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
