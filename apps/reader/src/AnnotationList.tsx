import { Select, type SelectItems } from "@mdbase-dev/ui/select";
import { useMemo, useState, type JSX } from "react";

import {
  indexAnnotations,
  searchAnnotationIndex,
  type AnnotationFilter,
} from "./annotation-list-order.js";
import { AnnotationCard } from "./AnnotationCard.js";
import { FilterIcon, SearchIcon } from "./icons.js";
import { Menu } from "./Menu.js";
import { useAnnotationBrowserFind } from "./use-annotation-browser-find.js";
import { VirtualAnnotationList } from "./VirtualAnnotationList.js";

import type { AnnotationFileReader } from "./AnnotationImage.js";
import type { AnnotationTransclusionController } from "./use-annotation-transclusion.js";
import type { AsyncResource } from "./use-reader-workspace.js";
import type {
  Annotation,
  AnnotationDeletionPlan,
  AnnotationId,
  SourceSummary,
} from "@mdbase-reader/core";

interface AnnotationListProps {
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly owners?: readonly SourceSummary[] | undefined;
  readonly onMoveOwner?:
    ((annotation: Annotation, owner: SourceSummary) => Promise<void>) | undefined;
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
  onMoveOwner,
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
  const [ownerFilter, setOwnerFilter] = useState("");
  const [filter, setFilter] = useState<AnnotationFilter>("all");
  const [order, setOrder] = useState<"document" | "newest">("document");
  const index = useMemo(
    () => (annotations.status === "ready" ? indexAnnotations(annotations.value, order) : []),
    [annotations, order],
  );
  const results = useMemo(
    () =>
      searchAnnotationIndex(index, query, filter).filter(
        (annotation) => !ownerFilter || annotation.sourceId === ownerFilter,
      ),
    [index, query, filter, ownerFilter],
  );
  const { renderAll, setRenderAll, browserRef } = useAnnotationBrowserFind();
  if (annotations.status !== "ready" || !annotations.value.length) {
    return <AnnotationListStatus annotations={annotations} />;
  }
  const clear = (): void => {
    setQuery("");
    setFilter("all");
    setOwnerFilter("");
  };
  const hiddenActive =
    annotations.value.some(({ id }) => id === activeId) &&
    !results.some(({ id }) => id === activeId);
  return (
    <div className="annotation-browser" ref={browserRef}>
      <ChapterAnnotationFilter owners={owners} value={ownerFilter} onChange={setOwnerFilter} />
      <AnnotationBrowserControls
        query={query}
        filter={filter}
        order={order}
        total={annotations.value.length}
        results={results.length}
        hiddenActive={hiddenActive}
        onQueryChange={setQuery}
        onFilterChange={setFilter}
        onOrderChange={setOrder}
        onClear={clear}
      />
      <label className="annotation-find-mode">
        <input
          type="checkbox"
          checked={renderAll}
          onChange={(event) => setRenderAll(event.target.checked)}
        />
        Include all annotations in page search
        <span>{renderAll ? "Slower with long lists" : "Search above covers all annotations"}</span>
      </label>
      <VirtualAnnotationList
        results={results}
        renderAll={renderAll}
        readingId={readingId}
        editingId={currentEditing}
        activeId={activeId}
        renderCard={(annotation) => (
          <AnnotationCard
            annotation={annotation}
            owners={owners}
            onMoveOwner={onMoveOwner}
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
        {!results.length ? (
          <div className="inspector-status">
            <strong>No matching annotations</strong>
            <button type="button" onClick={clear}>
              Clear filters
            </button>
          </div>
        ) : null}
      </VirtualAnnotationList>
    </div>
  );
}

function ChapterAnnotationFilter({
  owners,
  value,
  onChange,
}: {
  readonly owners?: readonly SourceSummary[] | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element | null {
  if (!owners || owners.length < 2) {
    return null;
  }
  return (
    <label className="annotation-chapter-filter">
      Source{" "}
      <select
        aria-label="Filter annotations by source"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All sources</option>
        {owners.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.title}
          </option>
        ))}
      </select>
    </label>
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
  if (!annotations.value.length) {
    return (
      <div className="inspector-status annotation-empty">
        <strong>No annotations yet</strong>
        <span>
          Select text or an area in the document, or add a source comment or bookmark above.
        </span>
      </div>
    );
  }
  return <></>;
}

type AnnotationOrder = "document" | "newest";

function AnnotationBrowserControls({
  query,
  filter,
  order,
  total,
  results,
  hiddenActive,
  onQueryChange,
  onFilterChange,
  onOrderChange,
  onClear,
}: {
  readonly query: string;
  readonly filter: AnnotationFilter;
  readonly order: AnnotationOrder;
  readonly total: number;
  readonly results: number;
  readonly hiddenActive: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onFilterChange: (filter: AnnotationFilter) => void;
  readonly onOrderChange: (order: AnnotationOrder) => void;
  readonly onClear: () => void;
}): JSX.Element {
  const filtered = query.trim() !== "" || filter !== "all";
  return (
    <div className="annotation-browser-controls">
      <div className="annotation-search">
        <SearchIcon />
        <input
          type="search"
          aria-label="Search annotations"
          placeholder="Search annotations"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <Menu
          className="annotation-view-menu"
          label={`Filter and sort annotations${filter === "all" ? "" : ", filtered"}`}
          triggerClassName={`icon-button${filter === "all" ? "" : " is-active"}`}
          trigger={<FilterIcon />}
        >
          <div className="library-options" data-menu-keep-open>
            <label>
              <span>Show</span>
              <Select
                aria-label="Filter annotations"
                value={filter}
                options={annotationFilterOptions}
                onChange={onFilterChange}
              />
            </label>
            <label>
              <span>Order</span>
              <Select
                aria-label="Sort annotations"
                value={order}
                options={annotationOrderOptions}
                onChange={onOrderChange}
              />
            </label>
          </div>
        </Menu>
      </div>
      {filtered ? (
        <small role="status">
          {results} of {total}
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
    </div>
  );
}

const annotationFilterOptions: SelectItems<AnnotationFilter> = [
  { value: "all", label: "All" },
  { value: "comments", label: "With comments" },
  { value: "highlight", label: "Highlights" },
  { value: "area", label: "Area captures" },
  { value: "note", label: "Source comments" },
  { value: "bookmark", label: "Bookmarks" },
];

const annotationOrderOptions: SelectItems<AnnotationOrder> = [
  { value: "document", label: "Document order" },
  { value: "newest", label: "Newest first" },
];
