import { useEffect, useRef, type JSX, type RefObject } from "react";

import { annotationBodyContent } from "./annotation-body-content.js";
import { annotationDraftKey } from "./annotation-drafts.js";
import { AnnotationBodyEditor } from "./AnnotationEditor.js";
import { AnnotationImage, type AnnotationFileReader } from "./AnnotationImage.js";
import { FocusIcon } from "./icons.js";
import { useAnnotationDraft } from "./use-annotation-draft.js";

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
  readonly onSave: (body: string) => Promise<void>;
  readonly onPlanDelete: () => Promise<AnnotationDeletionPlan>;
  readonly onDelete: (plan: AnnotationDeletionPlan) => Promise<void>;
  readonly onOpen: () => void;
  readonly readFile: AnnotationFileReader;
}): JSX.Element {
  const cardRef = useScrollToEditing(active || editing);
  const draft = useAnnotationDraft(
    annotationDraftKey(annotation.collectionId, annotation.sourceId, annotation.id),
  );
  return (
    // Pointer shortcut; keyboard users have explicit Edit and Open buttons.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <article
      ref={cardRef}
      className={`annotation-card${editing ? " is-editing" : ""}${active ? " is-selected" : ""}`}
      data-annotation-id={annotation.id}
      role="group"
      aria-label={`${annotation.annotationType} annotation`}
      onClick={() => {
        if (!editing) {
          onOpen();
        }
      }}
    >
      <header>
        <span className={`annotation-kind is-${annotation.annotationType}`}>
          {annotation.annotationType}
        </span>
        {annotation.locator ? (
          <small title={annotation.locator.label}>
            {annotation.locator.label.replace(/^\[\[.*\]\]$/u, "Document passage")}
          </small>
        ) : null}
        {draft.value && !editing ? (
          <small className="annotation-draft-badge">Unfinished edit</small>
        ) : null}
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
        <AnnotationBody annotation={annotation} readFile={readFile} />
      )}
      {!editing ? (
        <AnnotationCardFooter
          annotation={annotation}
          transclusion={transclusion}
          onEdit={onEdit}
          onOpen={onOpen}
          resume={draft.value !== null}
        />
      ) : null}
      {transclusion.problemId === annotation.id ? (
        <p className="annotation-card-problem" role="alert">
          {transclusion.problem}
        </p>
      ) : null}
    </article>
  );
}

function useScrollToEditing(editing: boolean): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (editing) {
      ref.current?.scrollIntoView({
        block: "nearest",
        behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
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
  return (
    <>
      {content.images.map((image) => (
        <AnnotationImage key={image.path} image={image} readFile={readFile} />
      ))}
      {content.quote ? <blockquote>{content.quote}</blockquote> : null}
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
}: {
  readonly annotation: Annotation;
  readonly transclusion: AnnotationTransclusionController;
  readonly onEdit: () => void;
  readonly onOpen: () => void;
  readonly resume: boolean;
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
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          {resume ? "Resume edit" : "Edit"}
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
          <FocusIcon />
        </button>
      </div>
    </footer>
  );
}
