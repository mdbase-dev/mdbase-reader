import { useMemo, useState, type JSX, type ReactNode } from "react";

import {
  annotationFromOtherSource,
  annotationGroupHeadings,
  type AnnotationGroupHeading,
} from "./annotation-groups.js";
import {
  annotationMatchesColor,
  indexAnnotations,
  searchAnnotationIndex,
} from "./annotation-list-order.js";
import { AnnotationCard } from "./AnnotationCard.js";
import {
  AnnotationFilterMenu,
  annotationViewIsDefault,
  defaultAnnotationView,
  type AnnotationView,
} from "./AnnotationFilterMenu.js";
import { annotationSourceHref } from "./AnnotationOwnerActions.js";
import { SearchIcon } from "./icons.js";
import { useAnnotationBrowserFind } from "./use-annotation-browser-find.js";
import { VirtualAnnotationList } from "./VirtualAnnotationList.js";

import type { AnnotationFileReader } from "./AnnotationImage.js";
import type { AnnotationTransclusionController } from "./use-annotation-transclusion.js";
import type { AsyncResource } from "./use-reader-workspace.js";
import type {
  Annotation,
  AnnotationDeletionPlan,
  AnnotationId,
  HighlightColorKey,
  SourceId,
  SourceSummary,
} from "@mdbase-reader/core";

interface AnnotationListProps {
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly owners?: readonly SourceSummary[] | undefined;
  /** The open source; annotations saved to any other source say so. */
  readonly currentSourceId?: SourceId | undefined;
  readonly onMoveOwner?:
    ((annotation: Annotation, owner: SourceSummary) => Promise<void>) | undefined;
  readonly onRecolor?:
    ((annotation: Annotation, color: HighlightColorKey) => Promise<void>) | undefined;
  /** The Add menu (source comment, bookmark) that ends the control row. */
  readonly addMenu?: ReactNode;
  /** Shown between the control row and the cards, such as a new source comment. */
  readonly beforeList?: ReactNode;
  /** For a chapter: whether the panel includes the whole book's annotations. */
  readonly wholeBook?:
    { readonly value: boolean; readonly onChange: (value: boolean) => void } | undefined;
  readonly transclusion: AnnotationTransclusionController;
  readonly onUpdate: (annotation: Annotation, body: string) => Promise<Annotation>;
  readonly onPlanDelete: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (annotation: Annotation, plan: AnnotationDeletionPlan) => Promise<void>;
  readonly onOpen: (annotation: Annotation) => void;
  readonly editingId: AnnotationId | null;
  readonly activeId: AnnotationId | null;
  readonly readingId?: AnnotationId | null;
  readonly onCancelEdit: () => void;
  readonly readFile: AnnotationFileReader;
}
export function AnnotationList({
  annotations,
  transclusion,
  onUpdate,
  onPlanDelete,
  onDelete,
  onOpen,
  editingId,
  activeId,
  readingId = null,
  onCancelEdit,
  readFile,
  owners,
  currentSourceId,
  onMoveOwner,
  onRecolor,
  addMenu,
  beforeList,
  wholeBook,
}: AnnotationListProps): JSX.Element {
  const [editing, setEditing] = useState({ external: editingId, id: editingId });
  const currentEditing = editing.external === editingId ? editing.id : editingId;
  const closeEditor = (): void => {
    setEditing({ external: editingId, id: null });
    if (currentEditing === editingId) {
      onCancelEdit();
    }
  };
  const [query, setQuery] = useState("");
  const [view, setView] = useState<AnnotationView>(defaultAnnotationView);
  const [following, setFollowing] = useState(true);
  const { renderAll, setRenderAll, browserRef } = useAnnotationBrowserFind();
  const context = { currentSourceId, owners };
  const { scoped, results, headings } = useAnnotationResults(annotations, view, query, context);
  const grouped = view.order === "document";
  const total = annotations.status === "ready" ? annotations.value.length : 0;
  const ready = annotations.status === "ready";
  const clear = (): void => {
    setQuery("");
    setView(clearedFilters);
  };
  const hiddenActive = activeIsHidden(annotations, results, activeId);
  return (
    <div className="annotation-browser" ref={browserRef}>
      <div className="annotation-tools">
        {total > 0 ? <AnnotationSearch query={query} onQueryChange={setQuery} /> : null}
        {total > 0 || wholeBook ? (
          <AnnotationFilterMenu
            view={view}
            onViewChange={setView}
            scoped={scoped}
            owners={owners}
            wholeBook={wholeBook}
            following={following}
            onFollowingChange={setFollowing}
            renderAll={renderAll}
            onRenderAllChange={setRenderAll}
            changed={filterMenuChanged(view, { renderAll, wholeBook })}
          />
        ) : null}
        {addMenu}
      </div>
      <AnnotationFilterStatus
        filtered={isFiltered(query, view)}
        hiddenActive={hiddenActive}
        paused={!following}
        onResume={() => setFollowing(true)}
        shown={results.length}
        total={total}
        onClear={clear}
      />
      {beforeList}
      {!ready || !total ? (
        <AnnotationListStatus annotations={annotations} />
      ) : (
        <VirtualAnnotationList
          results={results}
          renderAll={renderAll}
          readingId={readingId}
          editingId={currentEditing}
          activeId={activeId}
          following={following}
          onFollowingChange={setFollowing}
          renderHeading={(position) => {
            const heading = headings[position];
            const annotation = results[position];
            return heading && annotation ? (
              <AnnotationGroupTitle heading={heading} annotation={annotation} />
            ) : null;
          }}
          renderCard={(annotation) => (
            <AnnotationCard
              annotation={annotation}
              owners={owners}
              onMoveOwner={onMoveOwner}
              onRecolor={onRecolor}
              showLocation={!grouped}
              // Headings name another source per run; the selected card also names it itself.
              showSource={
                annotationFromOtherSource(annotation, currentSourceId) &&
                (!grouped || activeId === annotation.id)
              }
              editing={currentEditing === annotation.id}
              active={activeId === annotation.id}
              transclusion={transclusion}
              onEdit={() => setEditing({ external: editingId, id: annotation.id })}
              onCancel={closeEditor}
              onSave={onUpdate}
              onPlanDelete={onPlanDelete}
              onDelete={onDelete}
              onOpen={() => onOpen(annotation)}
              readFile={readFile}
            />
          )}
        >
          {!results.length ? <NoMatchingAnnotations onClear={clear} /> : null}
        </VirtualAnnotationList>
      )}
    </div>
  );
}

/** Search, type, source or colour hides some annotations; the order does not. */
function isFiltered(query: string, view: AnnotationView): boolean {
  return query.trim() !== "" || view.filter !== "all" || view.source !== "" || view.color !== "";
}

function clearedFilters(view: AnnotationView): AnnotationView {
  return { ...view, filter: "all", source: "", color: "" };
}

/** The selected annotation exists but the search or filters hide it. */
function activeIsHidden(
  annotations: AsyncResource<readonly Annotation[]>,
  results: readonly Annotation[],
  activeId: string | null,
): boolean {
  return (
    annotations.status === "ready" &&
    annotations.value.some(({ id }) => id === activeId) &&
    !results.some(({ id }) => id === activeId)
  );
}

function useAnnotationResults(
  annotations: AsyncResource<readonly Annotation[]>,
  view: AnnotationView,
  query: string,
  context: {
    readonly currentSourceId: SourceId | undefined;
    readonly owners: readonly SourceSummary[] | undefined;
  },
): {
  readonly scoped: ReturnType<typeof indexAnnotations>;
  readonly results: readonly Annotation[];
  readonly headings: readonly (AnnotationGroupHeading | null)[];
} {
  const index = useMemo(
    () => (annotations.status === "ready" ? indexAnnotations(annotations.value, view.order) : []),
    [annotations, view.order],
  );
  // Counts follow the source choice but not the type, so each type shows what choosing it gives.
  const scoped = useMemo(
    () =>
      view.source ? index.filter(({ annotation }) => annotation.sourceId === view.source) : index,
    [index, view.source],
  );
  const results = useMemo(
    () =>
      searchAnnotationIndex(scoped, query, view.filter).filter((annotation) =>
        annotationMatchesColor(annotation, view.color),
      ),
    [scoped, query, view.filter, view.color],
  );
  const { currentSourceId, owners } = context;
  const headings = useMemo(
    () =>
      view.order === "document" ? annotationGroupHeadings(results, currentSourceId, owners) : [],
    [view.order, results, currentSourceId, owners],
  );
  return { scoped, results, headings };
}

/**
 * The Filter menu's dot: type, source, order, whole-book scope or page search is not at its
 * default. Paused following is not a filter; the status area offers Resume following instead.
 */
function filterMenuChanged(
  view: AnnotationView,
  state: {
    readonly renderAll: boolean;
    readonly wholeBook: AnnotationListProps["wholeBook"];
  },
): boolean {
  return !annotationViewIsDefault(view) || state.renderAll || Boolean(state.wholeBook?.value);
}

function AnnotationSearch({
  query,
  onQueryChange,
}: {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
}): JSX.Element {
  return (
    <div className="annotation-search">
      <SearchIcon />
      <input
        type="search"
        aria-label="Search annotations"
        placeholder="Search annotations"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </div>
  );
}

function AnnotationFilterStatus({
  filtered,
  hiddenActive,
  paused,
  onResume,
  shown,
  total,
  onClear,
}: {
  readonly filtered: boolean;
  readonly hiddenActive: boolean;
  /** Following the reading position paused after the list was browsed by hand. */
  readonly paused: boolean;
  readonly onResume: () => void;
  readonly shown: number;
  readonly total: number;
  readonly onClear: () => void;
}): JSX.Element | null {
  if (!filtered && !hiddenActive && !paused) {
    return null;
  }
  return (
    <div className="annotation-filter-status">
      {filtered ? (
        <small role="status">
          {shown} of {total}
          <button type="button" onClick={onClear}>
            Clear
          </button>
        </small>
      ) : null}
      {hiddenActive ? (
        <button type="button" onClick={onClear}>
          Show selected annotation (clear filters)
        </button>
      ) : null}
      {paused ? (
        <button type="button" className="annotation-resume-following" onClick={onResume}>
          Resume following
        </button>
      ) : null}
    </div>
  );
}

function AnnotationGroupTitle({
  heading,
  annotation,
}: {
  readonly heading: AnnotationGroupHeading;
  readonly annotation: Annotation;
}): JSX.Element {
  return (
    <h3 className="annotation-group">
      <span>{heading.label}</span>
      {heading.source ? (
        <small>
          {heading.source.summary ? (
            <a href={annotationSourceHref(annotation, heading.source.summary)}>
              {heading.source.title}
            </a>
          ) : (
            heading.source.title
          )}
        </small>
      ) : null}
    </h3>
  );
}

function NoMatchingAnnotations({ onClear }: { readonly onClear: () => void }): JSX.Element {
  return (
    <div className="inspector-status">
      <strong>No matching annotations</strong>
      <button type="button" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

function AnnotationListStatus({
  annotations,
}: {
  readonly annotations: AsyncResource<readonly Annotation[]>;
}): JSX.Element {
  if (annotations.status !== "ready") {
    return annotations.status === "error" ? (
      <div className="inspector-status is-error" role="alert">
        {annotations.message}
      </div>
    ) : (
      <div className="inspector-status">Loading annotations…</div>
    );
  }
  return (
    <div className="inspector-status annotation-empty">
      <strong>No annotations yet</strong>
      <span>
        Select text or an area in the document, or use Add above for a source comment or bookmark.
      </span>
    </div>
  );
}
