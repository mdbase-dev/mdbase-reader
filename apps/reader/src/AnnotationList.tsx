import { Select, type SelectItems } from "@mdbase-reader/ui";
import { useState, type JSX } from "react";

import { browseAnnotations, type AnnotationFilter } from "./annotation-list-order.js";
import { AnnotationCard } from "./AnnotationCard.js";
import { FilterIcon, SearchIcon } from "./icons.js";
import { Menu } from "./Menu.js";

import type { AnnotationFileReader } from "./AnnotationImage.js";
import type { AnnotationTransclusionController } from "./use-annotation-transclusion.js";
import type { AsyncResource } from "./use-reader-workspace.js";
import type { Annotation, AnnotationDeletionPlan, AnnotationId } from "@mdbase-reader/core";

export function AnnotationList({
  annotations,
  transclusion,
  onUpdate,
  onPlanDelete,
  onDelete,
  onOpen,
  editingId,
  activeId,
  onCancelEdit,
  readFile,
}: {
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly transclusion: AnnotationTransclusionController;
  readonly onUpdate: (annotation: Annotation, body: string) => Promise<Annotation>;
  readonly onPlanDelete: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (annotation: Annotation, plan: AnnotationDeletionPlan) => Promise<void>;
  readonly onOpen: (annotation: Annotation) => void;
  readonly editingId: AnnotationId | null;
  readonly activeId: AnnotationId | null;
  readonly onCancelEdit: () => void;
  readonly readFile: AnnotationFileReader;
}): JSX.Element {
  const [editing, setEditing] = useState({ external: editingId, id: editingId });
  const currentEditing = editing.external === editingId ? editing.id : editingId;
  const closeEditor = (): void => {
    setEditing({ external: editingId, id: null });
    if (currentEditing === editingId) {
      onCancelEdit();
    }
  };
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AnnotationFilter>("all");
  const [order, setOrder] = useState<"document" | "newest">("document");
  if (annotations.status !== "ready" || !annotations.value.length) {
    return <AnnotationListStatus annotations={annotations} />;
  }
  const results = browseAnnotations(annotations.value, query, filter, order);
  const clear = (): void => {
    setQuery("");
    setFilter("all");
  };
  const hiddenActive =
    annotations.value.some(({ id }) => id === activeId) &&
    !results.some(({ id }) => id === activeId);
  return (
    <>
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
      <div className="annotation-list">
        {!results.length ? (
          <div className="inspector-status">
            <strong>No matching annotations</strong>
            <button type="button" onClick={clear}>
              Clear filters
            </button>
          </div>
        ) : null}
        {results.map((annotation) => (
          <AnnotationCard
            key={annotation.id}
            annotation={annotation}
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
        ))}
      </div>
    </>
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
        <span>Select text or an area in the document, or add a comment or bookmark above.</span>
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
  { value: "comments", label: "With commentary" },
  { value: "highlight", label: "Highlights" },
  { value: "area", label: "Area captures" },
  { value: "note", label: "Comments on the source" },
  { value: "bookmark", label: "Bookmarks" },
];

const annotationOrderOptions: SelectItems<AnnotationOrder> = [
  { value: "document", label: "Document order" },
  { value: "newest", label: "Newest first" },
];
