import { useState, type JSX } from "react";

import { AnnotationBodyEditor } from "./AnnotationEditor.js";
import { MoreIcon } from "./icons.js";

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
}: {
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly transclusion: AnnotationTransclusionController;
  readonly onUpdate: (annotation: Annotation, body: string) => Promise<Annotation>;
  readonly onPlanDelete: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (annotation: Annotation, plan: AnnotationDeletionPlan) => Promise<void>;
  readonly onOpen: (annotation: Annotation) => void;
}): JSX.Element {
  const [editingId, setEditingId] = useState<AnnotationId | null>(null);
  if (annotations.status !== "ready") {
    return annotations.status === "error" ? (
      <div className="inspector-status is-error" role="alert">
        {annotations.message}
      </div>
    ) : (
      <div className="inspector-status">Loading annotations…</div>
    );
  }
  if (annotations.value.length === 0) {
    return (
      <div className="inspector-status annotation-empty">
        <strong>No annotations yet</strong>
        <span>Select text or an area in the document to begin.</span>
      </div>
    );
  }
  return (
    <div className="annotation-list">
      <div className="annotation-list-heading">
        <span>On this source</span>
        <span>Newest first</span>
      </div>
      {annotations.value.map((annotation) => (
        <AnnotationCard
          key={annotation.id}
          annotation={annotation}
          editing={editingId === annotation.id}
          transclusion={transclusion}
          onEdit={() => setEditingId(annotation.id)}
          onCancel={() => setEditingId(null)}
          onSave={async (body) => {
            await onUpdate(annotation, body);
            setEditingId(null);
          }}
          onPlanDelete={() => onPlanDelete(annotation)}
          onDelete={(plan) => onDelete(annotation, plan)}
          onOpen={() => onOpen(annotation)}
        />
      ))}
    </div>
  );
}

function AnnotationCard({
  annotation,
  editing,
  transclusion,
  onEdit,
  onCancel,
  onSave,
  onPlanDelete,
  onDelete,
  onOpen,
}: {
  readonly annotation: Annotation;
  readonly editing: boolean;
  readonly transclusion: AnnotationTransclusionController;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
  readonly onSave: (body: string) => Promise<void>;
  readonly onPlanDelete: () => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (plan: AnnotationDeletionPlan) => Promise<void>;
  readonly onOpen: () => void;
}): JSX.Element {
  return (
    // This article is a keyboard-operable card when it is not in editing mode.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <article
      className="annotation-card"
      role={editing ? undefined : "button"}
      tabIndex={editing ? undefined : 0}
      onClick={() => {
        if (!editing) {
          onOpen();
        }
      }}
      onKeyDown={(event) => {
        if (!editing && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <header>
        <span className={`annotation-kind is-${annotation.annotationType}`}>
          {annotation.annotationType}
        </span>
        {annotation.locator ? <small>{annotation.locator.label}</small> : null}
      </header>
      {editing ? (
        <AnnotationBodyEditor
          annotation={annotation}
          onCancel={onCancel}
          onSave={onSave}
          onPlanDelete={onPlanDelete}
          onDelete={onDelete}
        />
      ) : (
        <AnnotationBody annotation={annotation} />
      )}
      {!editing ? (
        <footer>
          <time>
            {new Date(annotation.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </time>
          <div className="annotation-card-actions">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              Edit
            </button>
            <button
              type="button"
              disabled={transclusion.busyId !== null || transclusion.isEmbedded(annotation)}
              title={
                transclusion.isEmbedded(annotation)
                  ? "Already included in the source note"
                  : "Insert this annotation in the source note"
              }
              onClick={(event) => {
                event.stopPropagation();
                transclusion.insert(annotation);
              }}
            >
              {transclusion.busyId === annotation.id
                ? "Inserting…"
                : transclusion.isEmbedded(annotation)
                  ? "In source note"
                  : "Insert in note"}
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Open annotation in document"
              title="Open in document"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              <MoreIcon />
            </button>
          </div>
        </footer>
      ) : null}
      {transclusion.problemId === annotation.id ? (
        <p className="annotation-card-problem" role="alert">
          {transclusion.problem}
        </p>
      ) : null}
    </article>
  );
}

function AnnotationBody({ annotation }: { readonly annotation: Annotation }): JSX.Element {
  const note = annotation.body.replace(/^>.*$/gmu, "").trim();
  return (
    <>
      {annotation.target?.quote?.exact ? (
        <blockquote>{annotation.target.quote.exact}</blockquote>
      ) : null}
      {note ? <p>{note}</p> : null}
    </>
  );
}
