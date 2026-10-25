import {
  highlightColorKey,
  type Annotation,
  type AnnotationDeletionPlan,
  type HighlightColorKey,
  type SourceSummary,
} from "@mdbase-reader/core";
import { useEffect, useRef, useState, useSyncExternalStore, type JSX, type RefObject } from "react";

import { hasPassageAnchor } from "./annotation-anchor.js";
import { annotationBodyContent } from "./annotation-body-content.js";
import { scrollAnnotationCard } from "./annotation-card-scroll.js";
import { annotationOutsideChapter } from "./annotation-groups.js";
import { annotationKindLabel } from "./annotation-kind.js";
import { AnnotationBodyEditor } from "./AnnotationEditor.js";
import { AnnotationImage, type AnnotationFileReader } from "./AnnotationImage.js";
import {
  AnnotationMoveSelect,
  AnnotationMoveStatus,
  AnnotationSourceLine,
  useAnnotationMove,
  type AnnotationMoveState,
} from "./AnnotationOwnerActions.js";
import {
  highlightColorName,
  highlightColorProps,
  highlightMeaning,
  useHighlightMeanings,
} from "./highlight-colors.js";
import { HighlightSwatches } from "./HighlightSwatches.js";
import { FocusIcon, MoreIcon } from "./icons.js";
import { Menu } from "./Menu.js";
import { annotationLocationLabel } from "./passage-labels.js";
import { useAnnotationSession } from "./use-annotation-session.js";

import type { AnnotationTransclusionController } from "./use-annotation-transclusion.js";
const annotationDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

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
  owners,
  onMoveOwner,
  onRecolor,
  showLocation = true,
  showSource = false,
}: {
  readonly annotation: Annotation;
  readonly owners?: readonly SourceSummary[] | undefined;
  readonly onMoveOwner?:
    ((annotation: Annotation, owner: SourceSummary) => Promise<void>) | undefined;
  /** Changes a highlight's colour; absent when the collection cannot. */
  readonly onRecolor?:
    ((annotation: Annotation, color: HighlightColorKey) => Promise<void>) | undefined;
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
  /** False when a group heading above the card already names its location. */
  readonly showLocation?: boolean;
  /** True when the annotation belongs to a source other than the open one. */
  readonly showSource?: boolean;
}): JSX.Element {
  // The list reveals explicit selection once; remounting a windowed selected card must not jump.
  const cardRef = useScrollToEditing(editing);
  const session = useAnnotationSession(annotation, onSave);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const move = useAnnotationMove(annotation, onMoveOwner);
  const needsAttention =
    snapshot.status === "unsaved" || Boolean(snapshot.problem ?? snapshot.conflict);
  const linked = hasPassageAnchor(annotation.target);
  return (
    // Pointer shortcut; keyboard users have explicit Edit and Show in document buttons.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      ref={cardRef}
      className={cardClassName(annotation, { editing, active, linked })}
      {...highlightColorProps(annotation.color)}
      data-annotation-id={annotation.id}
      role="group"
      aria-label={`${annotationKindLabel(annotation.annotationType)} annotation`}
      onClick={(event) => {
        if (!editing && linked && !selectsTextIn(event.currentTarget)) {
          onOpen();
        }
      }}
    >
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
        <footer>
          {/* Content first, then the quiet details on the same row as the actions. */}
          <AnnotationMeta
            annotation={annotation}
            showKind={annotation.annotationType !== "highlight"}
            showLocation={showLocation}
            // Without group headings, a card outside its chapter's pages says so itself.
            outsideChapter={showLocation && annotationOutsideChapter(annotation, owners ?? [])}
            draft={needsAttention ? draftLabel(Boolean(snapshot.conflict)) : null}
          />
          <AnnotationCardActions
            annotation={annotation}
            transclusion={transclusion}
            onEdit={onEdit}
            onOpen={onOpen}
            resume={needsAttention}
            editingElsewhere={snapshot.editing}
            owners={owners}
            move={onMoveOwner ? move : null}
            moveDisabled={cannotMoveOwner(editing, needsAttention, snapshot.editing)}
            recolor={onRecolor && annotation.annotationType === "highlight" ? onRecolor : null}
          />
        </footer>
      ) : null}
      <AnnotationSourceLine annotation={annotation} sources={owners} showSource={showSource} />
      <AnnotationMoveStatus state={move} />
      {transclusion.problemId === annotation.id ? (
        <p className="annotation-card-problem" role="alert">
          {transclusion.problem}
        </p>
      ) : null}
    </div>
  );
}

function cardClassName(
  annotation: Annotation,
  state: { readonly editing: boolean; readonly active: boolean; readonly linked: boolean },
): string {
  return [
    "annotation-card",
    `is-${annotation.annotationType}`,
    state.editing ? "is-editing" : "",
    state.active ? "is-selected" : "",
    state.linked ? "is-linked" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function draftLabel(conflict: boolean): string {
  return conflict ? "Changes need review" : "Unsaved changes";
}

/** Quiet secondary details: kind (except for highlights), date, location and draft state. */
function AnnotationMeta({
  annotation,
  showKind,
  showLocation,
  outsideChapter,
  draft,
}: {
  readonly annotation: Annotation;
  readonly showKind: boolean;
  readonly showLocation: boolean;
  readonly outsideChapter: boolean;
  readonly draft: string | null;
}): JSX.Element {
  const location = showLocation ? annotationLocationLabel(annotation) : undefined;
  const meanings = useHighlightMeanings();
  const colored = hasHighlightColor(annotation);
  const meaning = colored ? highlightMeaning(annotation.color, meanings) : null;
  return (
    <span className="annotation-meta">
      {meaning ? (
        <small
          className="annotation-meaning"
          title={highlightColorName(annotation.color, meanings)}
        >
          {meaning}
        </small>
      ) : null}
      {showKind ? (
        <span className={`annotation-kind is-${annotation.annotationType}`}>
          {annotationKindLabel(annotation.annotationType)}
        </span>
      ) : null}
      <time dateTime={annotation.createdAt}>
        {annotationDate.format(new Date(annotation.createdAt))}
      </time>
      {location ? (
        <small
          className="annotation-locator"
          title={
            hasPassageAnchor(annotation.target)
              ? location
              : `${location} · saved without a link to the exact passage`
          }
        >
          {location}
        </small>
      ) : null}
      {outsideChapter ? (
        <small
          className="annotation-locator is-outside-chapter"
          title="Outside the chapter’s pages; it still belongs to this chapter"
        >
          Outside chapter
        </small>
      ) : null}
      {draft ? <small className="annotation-draft-badge">{draft}</small> : null}
      {/* The bar's colour, in words, for anyone who cannot see it. */}
      {colored && !meaning ? (
        <span className="sr-only">{highlightColorName(annotation.color, meanings)}</span>
      ) : null}
    </span>
  );
}

/** Highlights and other passages carry a colour; notes, bookmarks and areas do not. */
function hasHighlightColor(annotation: Annotation): boolean {
  return annotation.annotationType === "highlight" || Boolean(annotation.target?.quote);
}

/** A drag that selects part of the card, to copy its quote, ends in a click that must not open it. */
function selectsTextIn(card: HTMLElement): boolean {
  const selection = card.ownerDocument.getSelection();
  return Boolean(
    selection &&
    !selection.isCollapsed &&
    (card.contains(selection.anchorNode) || card.contains(selection.focusNode)),
  );
}

function cannotMoveOwner(
  editing: boolean,
  needsAttention: boolean,
  editingElsewhere: boolean,
): boolean {
  return editing || needsAttention || editingElsewhere;
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

/** The highlight's colour, changed in place; the card's bar follows once it is saved. */
function AnnotationColorChoice({
  annotation,
  recolor,
}: {
  readonly annotation: Annotation;
  readonly recolor: (annotation: Annotation, color: HighlightColorKey) => Promise<void>;
}): JSX.Element {
  const meanings = useHighlightMeanings();
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  return (
    <div className="annotation-card-colors">
      <span>Colour</span>
      <HighlightSwatches
        mode="recolor"
        ringed={highlightColorKey(annotation.color)}
        meanings={meanings}
        shortcuts={false}
        disabled={state === "saving" || !annotation.path || !annotation.recordRevision}
        onChoose={(color) => {
          setState("saving");
          void recolor(annotation, color).then(
            () => setState("idle"),
            () => setState("failed"),
          );
        }}
      />
      {state === "failed" ? <small role="alert">Couldn’t change the colour.</small> : null}
    </div>
  );
}

function AnnotationCardActions({
  annotation,
  transclusion,
  onEdit,
  onOpen,
  resume,
  editingElsewhere,
  owners,
  move,
  moveDisabled,
  recolor,
}: {
  readonly annotation: Annotation;
  readonly transclusion: AnnotationTransclusionController;
  readonly onEdit: () => void;
  readonly onOpen: () => void;
  readonly resume: boolean;
  readonly editingElsewhere: boolean;
  readonly owners: readonly SourceSummary[] | undefined;
  readonly move: AnnotationMoveState | null;
  readonly moveDisabled: boolean;
  readonly recolor: ((annotation: Annotation, color: HighlightColorKey) => Promise<void>) | null;
}): JSX.Element {
  return (
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
            : "Insert into source note"}
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
      <AnnotationCardMore
        annotation={annotation}
        movable={move && owners && owners.length > 1 ? { move, owners } : null}
        moveDisabled={moveDisabled}
        recolor={recolor}
      />
    </div>
  );
}

/** The card's More menu: the highlight's colour and, with several sources, its owner. */
function AnnotationCardMore({
  annotation,
  movable,
  moveDisabled,
  recolor,
}: {
  readonly annotation: Annotation;
  readonly movable: {
    readonly move: AnnotationMoveState;
    readonly owners: readonly SourceSummary[];
  } | null;
  readonly moveDisabled: boolean;
  readonly recolor: ((annotation: Annotation, color: HighlightColorKey) => Promise<void>) | null;
}): JSX.Element | null {
  if (!movable && !recolor) {
    return null;
  }
  return (
    // The menu is a pointer-free island: clicks inside it never open the card's passage.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <span className="annotation-card-more" onClick={(event) => event.stopPropagation()}>
      <Menu label="More actions" trigger={<MoreIcon />}>
        <div className="annotation-card-more-panel" data-menu-keep-open>
          {recolor ? <AnnotationColorChoice annotation={annotation} recolor={recolor} /> : null}
          {movable ? (
            <AnnotationMoveSelect
              annotation={annotation}
              sources={movable.owners}
              disabled={moveDisabled}
              state={movable.move}
            />
          ) : null}
        </div>
      </Menu>
    </span>
  );
}
