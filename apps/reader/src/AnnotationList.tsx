import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Select, type SelectItems } from "@mdbase-dev/ui/select";
import { useMemo, useState, type JSX } from "react";

import { browseAnnotations, type AnnotationFilter } from "./annotation-list-order.js";
import { AnnotationCard } from "./AnnotationCard.js";
import { FilterIcon, SearchIcon } from "./icons.js";
import { Menu } from "./Menu.js";
import { VirtualAnnotationList } from "./VirtualAnnotationList.js";

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
  const results = useMemo(
    () =>
      annotations.status === "ready"
        ? browseAnnotations(annotations.value, query, filter, order)
        : [],
    [annotations, query, filter, order],
  );
  if (annotations.status !== "ready" || !annotations.value.length) {
    return <AnnotationListStatus annotations={annotations} />;
  }
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
      <VirtualAnnotationList
        results={results}
        editingId={currentEditing}
        activeId={activeId}
        renderCard={(annotation) => (
          <AnnotationCard
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
        )}
      >
        {!results.length ? (
          <div className="inspector-status">
            <strong>
              <Trans>No matching annotations</Trans>
            </strong>
            <button type="button" onClick={clear}>
              <Trans>Clear filters</Trans>
            </button>
          </div>
        ) : null}
      </VirtualAnnotationList>
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
      <div className="inspector-status">
        <Trans>Loading annotations…</Trans>
      </div>
    );
  }
  if (!annotations.value.length) {
    return (
      <div className="inspector-status annotation-empty">
        <strong>
          <Trans>No annotations yet</Trans>
        </strong>
        <span>
          <Trans>Select text or an area in the document, or add a comment or bookmark above.</Trans>
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
  const { t } = useLingui();
  const filtered = query.trim() !== "" || filter !== "all";
  return (
    <div className="annotation-browser-controls">
      <div className="annotation-search">
        <SearchIcon />
        <input
          type="search"
          aria-label={t({ message: "Search annotations", context: "AnnotationList interface" })}
          placeholder={t({ message: "Search annotations", context: "AnnotationList interface" })}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <Menu
          className="annotation-view-menu"
          label={
            filter === "all"
              ? t`Filter and sort annotations`
              : t`Filter and sort annotations, filtered`
          }
          triggerClassName={`icon-button${filter === "all" ? "" : " is-active"}`}
          trigger={<FilterIcon />}
        >
          <div className="library-options" data-menu-keep-open>
            <label>
              <span>{t({ message: "Show" })}</span>
              <Select
                aria-label={t({
                  message: "Filter annotations",
                  context: "AnnotationList interface",
                })}
                value={filter}
                options={annotationFilterOptions()}
                onChange={onFilterChange}
              />
            </label>
            <label>
              <span>{t({ message: "Order" })}</span>
              <Select
                aria-label={t({ message: "Sort annotations", context: "AnnotationList interface" })}
                value={order}
                options={annotationOrderOptions()}
                onChange={onOrderChange}
              />
            </label>
          </div>
        </Menu>
      </div>
      {filtered ? (
        <small role="status">
          <Trans>
            {results} of {total}
          </Trans>
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
    </div>
  );
}

function annotationFilterOptions(): SelectItems<AnnotationFilter> {
  return [
    {
      value: "all",
      label: translate({ message: "All", context: "AnnotationList annotationFilterOptions" }),
    },
    {
      value: "comments",
      label: translate({
        message: "With commentary",
        context: "AnnotationList annotationFilterOptions",
      }),
    },
    {
      value: "highlight",
      label: translate({
        message: "Highlights",
        context: "AnnotationList annotationFilterOptions",
      }),
    },
    {
      value: "area",
      label: translate({
        message: "Area captures",
        context: "AnnotationList annotationFilterOptions",
      }),
    },
    {
      value: "note",
      label: translate({
        message: "Comments on the source",
        context: "AnnotationList annotationFilterOptions",
      }),
    },
    {
      value: "bookmark",
      label: translate({ message: "Bookmarks", context: "AnnotationList annotationFilterOptions" }),
    },
  ];
}

function annotationOrderOptions(): SelectItems<AnnotationOrder> {
  return [
    {
      value: "document",
      label: translate({
        message: "Document order",
        context: "AnnotationList annotationOrderOptions",
      }),
    },
    {
      value: "newest",
      label: translate({
        message: "Newest first",
        context: "AnnotationList annotationOrderOptions",
      }),
    },
  ];
}
