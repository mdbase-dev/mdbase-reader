import { useState, type JSX } from "react";

import { browseAnnotations, type AnnotationFilter } from "./annotation-list-order.js";
import { AnnotationCard } from "./AnnotationCard.js";

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
      <div className="annotation-browser-controls">
        <input
          type="search"
          aria-label="Search annotations"
          placeholder="Search quotes and comments…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div>
          <select
            aria-label="Filter annotations"
            value={filter}
            onChange={(event) => setFilter(event.target.value as AnnotationFilter)}
          >
            <option value="all">All annotations</option>
            <option value="comments">With comments</option>
            <option value="highlight">Highlights</option>
            <option value="area">Area captures</option>
          </select>
          <select
            aria-label="Sort annotations"
            value={order}
            onChange={(event) => setOrder(event.target.value as "document" | "newest")}
          >
            <option value="document">Document order</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
        <small role="status">
          {results.length} of {annotations.value.length} annotations
        </small>
        {hiddenActive ? (
          <button type="button" onClick={clear}>
            Show selected annotation (clear filters)
          </button>
        ) : null}
      </div>
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
        <span>Select text or an area in the document to begin.</span>
      </div>
    );
  }
  return <></>;
}
