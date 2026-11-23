import { plural, t } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMemo, useState, type JSX, type ReactNode } from "react";

import {
  annotationFromOtherSource,
  annotationGroupHeadings,
  outsideChapterGroupNote,
  type AnnotationGroupHeading,
} from "./annotation-groups.js";
import {
  annotationMatchesColor,
  indexAnnotations,
  searchAnnotationIndex,
} from "./annotation-list-order.js";
import { annotationEntries, annotationsToMarkdown } from "./annotation-overview.js";
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
  /**
   * The whole collection's annotations rather than one source's: each names its source, search
   * also matches sources, and there is no reading position to follow. `owners` is every source.
   */
  readonly collection?: boolean;
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
  readonly transclusion?: AnnotationTransclusionController | undefined;
  readonly onUpdate: (annotation: Annotation, body: string) => Promise<Annotation>;
  readonly onPlanDelete: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (annotation: Annotation, plan: AnnotationDeletionPlan) => Promise<void>;
  readonly onOpen: (annotation: Annotation) => void;
  readonly editingId: AnnotationId | null;
  readonly activeId: AnnotationId | null;
  readonly readingId?: AnnotationId | null;
  readonly onCancelEdit: () => void;
  /** A card's own Edit began editing it, as the composer's edit would. */
  readonly onBeginEdit?: ((annotation: Annotation) => void) | undefined;
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
  onBeginEdit,
  collection = false,
}: AnnotationListProps): JSX.Element {
  const { currentEditing, closeEditor, beginEdit } = useListEditing(
    editingId,
    onCancelEdit,
    onBeginEdit,
  );
  const [query, setQuery] = useState("");
  const [view, setView] = useState<AnnotationView>(defaultAnnotationView);
  const [following, setFollowing] = useState(true);
  const { renderAll, setRenderAll, browserRef } = useAnnotationBrowserFind();
  const context = { currentSourceId, owners, editingId: currentEditing, collection };
  const { scoped, results, headings } = useAnnotationResults(annotations, view, query, context);
  const listedOwners = useListedOwners(annotations, owners, collection);
  const grouped = view.order === "document";
  const total = annotations.status === "ready" ? annotations.value.length : 0;
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
            owners={listedOwners}
            wholeBook={wholeBook}
            following={collection ? undefined : following}
            onFollowingChange={setFollowing}
            renderAll={renderAll}
            onRenderAllChange={setRenderAll}
            changed={filterMenuChanged(view, { renderAll, wholeBook })}
            footer={<CopyAsMarkdown annotations={results} sources={owners ?? []} />}
          />
        ) : null}
        {addMenu}
      </div>
      <AnnotationFilterStatus
        filtered={isFiltered(query, view)}
        hiddenActive={hiddenActive}
        paused={!collection && !following}
        onResume={() => setFollowing(true)}
        shown={results.length}
        total={total}
        onClear={clear}
      />
      {beforeList}
      {!total ? (
        <AnnotationListStatus annotations={annotations} collection={collection} />
      ) : (
        <VirtualAnnotationList
          results={results}
          renderAll={renderAll}
          readingId={readingId}
          editingId={currentEditing}
          activeId={activeId}
          following={following}
          onFollowingChange={setFollowing}
          renderHeading={(position) =>
            groupTitle(headings[position], results[position], collection ? "h2" : "h3")
          }
          renderCard={(annotation) => (
            <AnnotationCard
              annotation={annotation}
              owners={owners}
              onMoveOwner={onMoveOwner}
              onRecolor={onRecolor}
              showLocation={!grouped}
              // Headings name another source per run; the selected card also names it itself.
              showSource={
                (collection || annotationFromOtherSource(annotation, currentSourceId)) &&
                (!grouped || activeId === annotation.id)
              }
              editing={currentEditing === annotation.id}
              active={activeId === annotation.id}
              transclusion={transclusion}
              onEdit={() => beginEdit(annotation)}
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

/** A group's heading. Under a Notes panel's source it is a third level; in the library, a second. */
function groupTitle(
  heading: AnnotationGroupHeading | null | undefined,
  annotation: Annotation | undefined,
  level: "h2" | "h3",
): JSX.Element | null {
  return heading && annotation ? (
    <AnnotationGroupTitle heading={heading} annotation={annotation} level={level} />
  ) : null;
}

/**
 * The card being edited: the one the reader's composer names, or one whose own Edit was chosen
 * since, which the composer hears of so it can withdraw that highlight's Undo.
 */
function useListEditing(
  editingId: AnnotationId | null,
  onCancelEdit: () => void,
  onBeginEdit: ((annotation: Annotation) => void) | undefined,
): {
  readonly currentEditing: AnnotationId | null;
  readonly closeEditor: () => void;
  readonly beginEdit: (annotation: Annotation) => void;
} {
  const [editing, setEditing] = useState({ external: editingId, id: editingId });
  const currentEditing = editing.external === editingId ? editing.id : editingId;
  return {
    currentEditing,
    closeEditor: () => {
      setEditing({ external: editingId, id: null });
      if (currentEditing === editingId) {
        onCancelEdit();
      }
    },
    beginEdit: (annotation) => {
      onBeginEdit?.(annotation);
      setEditing({ external: editingId, id: annotation.id });
    },
  };
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
    /** The card being edited stays listed whatever the search or filters, so it can be. */
    readonly editingId?: AnnotationId | null;
    readonly collection?: boolean;
  },
): {
  readonly scoped: ReturnType<typeof indexAnnotations>;
  readonly results: readonly Annotation[];
  readonly headings: readonly (AnnotationGroupHeading | null)[];
} {
  const { currentSourceId, owners, collection = false } = context;
  const sources = useMemo(
    () => (collection ? new Map((owners ?? []).map((source) => [source.id, source])) : undefined),
    [collection, owners],
  );
  const index = useMemo(
    () =>
      annotations.status === "ready"
        ? indexAnnotations(annotations.value, view.order, sources)
        : [],
    [annotations, view.order, sources],
  );
  // Counts follow the source choice but not the type, so each type shows what choosing it gives.
  const scoped = useMemo(
    () =>
      view.source ? index.filter(({ annotation }) => annotation.sourceId === view.source) : index,
    [index, view.source],
  );
  const { editingId = null } = context;
  const results = useMemo(() => {
    const matches = searchAnnotationIndex(scoped, query, view.filter).filter((annotation) =>
      annotationMatchesColor(annotation, view.color),
    );
    if (editingId === null || matches.some(({ id }) => id === editingId)) {
      return matches;
    }
    const matched = new Set(matches.map(({ id }) => id));
    const pinned = index.some(({ annotation }) => annotation.id === editingId);
    return pinned
      ? index
          .map(({ annotation }) => annotation)
          .filter(({ id }) => matched.has(id) || id === editingId)
      : matches;
  }, [index, scoped, query, view.filter, view.color, editingId]);
  const headings = useMemo(
    () =>
      view.order === "document"
        ? annotationGroupHeadings(results, currentSourceId, owners, collection)
        : [],
    [view.order, results, currentSourceId, owners, collection],
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
  useLocale();
  return (
    <div className="annotation-search">
      <SearchIcon />
      <input
        type="search"
        aria-label={t({ message: "Search annotations", context: "AnnotationList interface" })}
        placeholder={t({ message: "Search annotations", context: "AnnotationList interface" })}
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
          {shown} <Trans>of </Trans>
          {total}
          <button type="button" onClick={onClear}>
            <Trans>Clear</Trans>
          </button>
        </small>
      ) : null}
      {hiddenActive ? (
        <button type="button" onClick={onClear}>
          <Trans>Show selected annotation (clear filters)</Trans>
        </button>
      ) : null}
      {paused ? (
        <button type="button" className="annotation-resume-following" onClick={onResume}>
          <Trans>Resume following</Trans>
        </button>
      ) : null}
    </div>
  );
}

function AnnotationGroupTitle({
  heading,
  annotation,
  level: Level,
}: {
  readonly heading: AnnotationGroupHeading;
  readonly annotation: Annotation;
  readonly level: "h2" | "h3";
}): JSX.Element {
  return (
    <Level className="annotation-group">
      <span>{heading.label}</span>
      {heading.outsideChapter ? <small>{outsideChapterGroupNote()}</small> : null}
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
    </Level>
  );
}

function NoMatchingAnnotations({ onClear }: { readonly onClear: () => void }): JSX.Element {
  return (
    <div className="inspector-status">
      <strong>
        <Trans>No matching annotations</Trans>
      </strong>
      <button type="button" onClick={onClear}>
        <Trans>Clear filters</Trans>
      </button>
    </div>
  );
}

function AnnotationListStatus({
  annotations,
  collection,
}: {
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly collection: boolean;
}): JSX.Element {
  if (annotations.status !== "ready") {
    return annotations.status === "error" ? (
      <div className="inspector-status is-error" role="alert">
        {annotations.message}
      </div>
    ) : (
      <div className="inspector-status">
        <Trans>Loading annotations…</Trans>
      </div>
    );
  }
  return (
    <div className="inspector-status annotation-empty">
      <strong>
        <Trans>No annotations yet</Trans>
      </strong>
      <span>
        {collection ? (
          <Trans>Highlights and notes you make while reading appear here.</Trans>
        ) : (
          <Trans>
            Select text or an area in the document, or use Add above for a source comment or
            bookmark.
          </Trans>
        )}
      </span>
    </div>
  );
}

/**
 * The sources the Source filter offers. A collection has far more sources than have
 * annotations, so only those with any are listed, by title.
 */
function useListedOwners(
  annotations: AsyncResource<readonly Annotation[]>,
  owners: readonly SourceSummary[] | undefined,
  collection: boolean,
): readonly SourceSummary[] | undefined {
  return useMemo(() => {
    if (!collection || !owners || annotations.status !== "ready") {
      return owners;
    }
    const used = new Set(annotations.value.map(({ sourceId }) => sourceId));
    return owners
      .filter(({ id }) => used.has(id))
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [annotations, collection, owners]);
}

/**
 * Copies the annotations shown, for writing: quotes and notes grouped under their source. It is
 * the last item of the Filter menu, under its own rule.
 */
function CopyAsMarkdown({
  annotations,
  sources,
}: {
  readonly annotations: readonly Annotation[];
  readonly sources: readonly SourceSummary[];
}): JSX.Element | null {
  useLocale();
  const [status, setStatus] = useState<string | null>(null);
  if (!annotations.length) {
    return null;
  }
  const copy = (): void => {
    void globalThis.navigator.clipboard
      .writeText(annotationsToMarkdown(annotationEntries(annotations, sources)))
      .then(() =>
        setStatus(
          plural(annotations.length, {
            one: "Copied # annotation as Markdown.",
            other: "Copied # annotations as Markdown.",
          }),
        ),
      )
      .catch(() => setStatus(t`Copying needs clipboard permission.`));
  };
  return (
    <>
      <hr />
      <div className="annotation-copy-markdown">
        <button type="button" onClick={copy}>
          {plural(annotations.length, {
            one: "Copy # annotation as Markdown",
            other: "Copy # annotations as Markdown",
          })}
        </button>
        {status ? <small role="status">{status}</small> : null}
      </div>
    </>
  );
}
