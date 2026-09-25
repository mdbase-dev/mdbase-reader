import { useEffect, useRef, useSyncExternalStore, type JSX, type RefObject } from "react";

import { hasPassageAnchor } from "./annotation-anchor.js";
import { annotationBodyContent } from "./annotation-body-content.js";
import { scrollAnnotationCard } from "./annotation-card-scroll.js";
import { annotationKindLabel } from "./annotation-kind.js";
import { AnnotationBodyEditor } from "./AnnotationEditor.js";
import { AnnotationImage, type AnnotationFileReader } from "./AnnotationImage.js";
import { FocusIcon } from "./icons.js";
import { useAnnotationSession } from "./use-annotation-session.js";

import type { AnnotationTransclusionController } from "./use-annotation-transclusion.js";
import type { Annotation, AnnotationDeletionPlan } from "@mdbase-reader/core";
export function AnnotationCard({
  annotation,
  editing,
  active,
  transclusion,
  onEdit,
  onCancel,
  onSave,
  onPlanDelete,
  onDelete,
  onOpen,
  readFile,
}: {
  readonly annotation: Annotation;
  readonly editing: boolean;
  readonly active: boolean;
  readonly transclusion: AnnotationTransclusionController;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
  readonly onSave: (annotation: Annotation, body: string) => Promise<Annotation>;
  readonly onPlanDelete: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (annotation: Annotation, plan: AnnotationDeletionPlan) => Promise<void>;
  readonly onOpen: () => void;
  readonly readFile: AnnotationFileReader;
}): JSX.Element {
  const cardRef = useScrollToEditing(active || editing);
  const session = useAnnotationSession(annotation, onSave);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const needsAttention =
    snapshot.status === "unsaved" || Boolean(snapshot.problem ?? snapshot.conflict);
  return (
    // Pointer shortcut; keyboard users have explicit Edit and Open buttons.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      ref={cardRef}
      className={`annotation-card${editing ? " is-editing" : ""}${active ? " is-selected" : ""}${hasPassageAnchor(annotation.target) ? " is-linked" : ""}`}
      data-annotation-id={annotation.id}
      role="group"
      aria-label={`${annotationKindLabel(annotation.annotationType)} annotation`}
      onClick={() => {
        if (!editing && hasPassageAnchor(annotation.target)) {
          onOpen();
        }
      }}
    >
      <header>
        <span className={`annotation-kind is-${annotation.annotationType}`}>
          {annotationKindLabel(annotation.annotationType)}
        </span>
        {annotation.locator ? (
          <small
            className="annotation-locator"
            title={
              hasPassageAnchor(annotation.target)
                ? annotation.locator.label
                : `${annotation.locator.label} · saved without a link to the exact passage`
            }
          >
            {annotation.locator.label.replace(/^\[\[.*\]\]$/u, "Document passage")}
          </small>
        ) : null}
        {needsAttention && !editing ? (
          <small className="annotation-draft-badge">
            {snapshot.conflict ? "Changes need review" : "Unsaved changes"}
          </small>
        ) : null}
      </header>
      {editing ? (
        <>
          {annotationBodyContent(annotation.body).images.map((image) => (
            <AnnotationImage key={image.path} image={image} readFile={readFile} />
          ))}
          <AnnotationBodyEditor
            annotation={annotation}
            onCancel={onCancel}
            onSave={onSave}
            onPlanDelete={onPlanDelete}
            onDelete={onDelete}
          />
        </>
      ) : (
        <AnnotationBody annotation={annotation} readFile={readFile} />
      )}
      {!editing ? (
        <AnnotationCardFooter
          annotation={annotation}
          transclusion={transclusion}
          onEdit={onEdit}
          onOpen={onOpen}
          resume={needsAttention}
          editingElsewhere={snapshot.editing}
        />
      ) : null}
      {transclusion.problemId === annotation.id ? (
        <p className="annotation-card-problem" role="alert">
          {transclusion.problem}
        </p>
      ) : null}
    </div>
  );
}

function useScrollToEditing(editing: boolean): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing && ref.current) {
      scrollAnnotationCard(ref.current);
    }
  }, [editing]);
  return ref;
}

function AnnotationBody({
  annotation,
  readFile,
}: {
  readonly annotation: Annotation;
  readonly readFile: AnnotationFileReader;
}): JSX.Element {
  const content = annotationBodyContent(annotation.body);
  // Older or externally written records may keep the passage only in the selector.
  const quote = content.quote ?? annotation.target?.quote?.exact ?? null;
  return (
    <>
      {content.images.map((image) => (
        <AnnotationImage key={image.path} image={image} readFile={readFile} />
      ))}
      {quote ? <blockquote>{quote}</blockquote> : null}
      {content.note ? <p>{content.note}</p> : null}
    </>
  );
}

function AnnotationCardFooter({
  annotation,
  transclusion,
  onEdit,
  onOpen,
  resume,
  editingElsewhere,
}: {
  readonly annotation: Annotation;
  readonly transclusion: AnnotationTransclusionController;
  readonly onEdit: () => void;
  readonly onOpen: () => void;
  readonly resume: boolean;
  readonly editingElsewhere: boolean;
}): JSX.Element {
  return (
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
          disabled={!annotation.path || !annotation.recordRevision}
          title={
            !annotation.path || !annotation.recordRevision
              ? "Editing requires a saved annotation"
              : undefined
          }
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          {editingElsewhere ? "Edit here" : resume ? "Resume edits" : "Edit"}
        </button>
        <button
          type="button"
          disabled={transclusion.busyId !== null || transclusion.isEmbedded(annotation)}
          title={
            transclusion.isEmbedded(annotation)
              ? "Already included in the literature note"
              : "Insert this annotation in the literature note"
          }
          onClick={(event) => {
            event.stopPropagation();
            transclusion.insert(annotation);
          }}
        >
          {transclusion.busyId === annotation.id
            ? "Inserting…"
            : transclusion.isEmbedded(annotation)
              ? "In literature note"
              : "Add to literature note"}
        </button>
        {hasPassageAnchor(annotation.target) ? (
          <button
            className="icon-button"
            type="button"
            aria-label="Show in document"
            title="Show in document"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            <FocusIcon />
          </button>
        ) : null}
      </div>
    </footer>
  );
}
