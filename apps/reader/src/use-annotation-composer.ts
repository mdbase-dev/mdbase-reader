import { signalMdbaseMark } from "@mdbase-dev/ui/mark-activity";
import { useCallback, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { useAnnotationActivations } from "./use-annotation-activations.js";
import {
  useAnnotationCreation,
  type AnnotationCreationController,
  type AnnotationCreationInput,
} from "./use-annotation-creation.js";
import { useAnnotationNavigation } from "./use-annotation-navigation.js";
import { useBookmarkAction } from "./use-bookmark-action.js";
import { useHighlightUndo, type SavedHighlight } from "./use-highlight-undo.js";
import { useReadingAnnotation } from "./use-reading-annotation.js";
import { useSelectionAnchor } from "./use-selection-anchor.js";
import { useSelectionToolbar, type SelectionToolbarState } from "./use-selection-toolbar.js";

import type { QuoteCitation } from "./selection-copy.js";
import type {
  Annotation,
  AnnotationDeletionPlan,
  AnnotationId,
  HighlightColorKey,
} from "@mdbase-reader/core";
import type { ViewportRect } from "@mdbase-reader/reading-surface";
export { saveSelection, subscribeToSelections } from "./annotation-selection.js";
export type { ComposerSelection } from "./annotation-composer-request.js";

export interface AnnotationComposerController extends Omit<AnnotationCreationController, "pause"> {
  readonly canOpenAnnotation: boolean;
  readonly activeAnnotationId: AnnotationId | null;
  readonly readingAnnotationId: AnnotationId | null;
  readonly revealedAnnotationId: AnnotationId | null;
  readonly editingAnnotationId: AnnotationId | null;
  readonly returnToReading: (() => void) | null;
  /** Where the current, freshly made selection sits on screen, if known. */
  readonly selectionAnchor: ViewportRect | null;
  /** Quick actions for the live selection or a clicked highlight. */
  readonly toolbar: SelectionToolbarState | null;
  readonly dismissToolbar: () => void;
  /** The source's title and citekey, for copying a passage with its citation. */
  readonly quoteCitation: Omit<QuoteCitation, "locator"> | null;
  /**
   * Deletes an annotation that nothing embeds. Otherwise leaves it in place and returns the notes
   * whose embeds would break, so the reader can review it first.
   */
  readonly remove: (annotation: Annotation) => Promise<readonly string[]>;
  readonly open: (annotation: Annotation) => void;
  readonly edit: (annotation: Annotation) => void;
  readonly stopEditing: () => void;
  readonly canBookmark: boolean;
  readonly bookmarking: boolean;
  readonly bookmark: () => void;
  /** The quick highlight just made, for its confirmation and Undo. */
  readonly savedHighlight: SavedHighlight | null;
  readonly undoSavedHighlight: () => void;
  readonly dismissSavedHighlight: () => void;
  /** Gives a highlight another colour; absent when the collection cannot. */
  readonly recolor?: ((annotation: Annotation, color: HighlightColorKey) => void) | undefined;
}
export function useAnnotationComposer(
  input: AnnotationCreationInput & {
    readonly annotations: readonly Annotation[];
    readonly recolorAnnotation?:
      ((annotation: Annotation, color: string) => Promise<Annotation>) | undefined;
    readonly planDeletion: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
    readonly deleteAnnotation: (
      annotation: Annotation,
      plan: AnnotationDeletionPlan,
    ) => Promise<void>;
  },
): AnnotationComposerController {
  const { sourceId, source, surface, annotations } = input;
  const [activeId, setActiveId] = useState<AnnotationId | null>(null);
  const [revealedId, setRevealedId] = useState<AnnotationId | null>(null);
  const [editingId, setEditingId] = useState<AnnotationId | null>(null);
  const navigation = useAnnotationNavigation(sourceId, surface);
  const readingAnnotationId = useReadingAnnotation(surface, annotations);
  const clearNavigationError = navigation.clearError;
  const resetSelection = useCallback(() => {
    setActiveId(null);
    setRevealedId(null);
    setEditingId(null);
    clearNavigationError();
  }, [clearNavigationError]);
  const select = (annotation: Annotation): void => {
    setActiveId(annotation.id);
    setRevealedId(null);
    setEditingId(null);
  };
  const toolbar = useSelectionToolbar(surface);
  const { planDeletion, deleteAnnotation } = input;
  const hideToolbar = toolbar.hide;
  const remove = useCallback(
    async (annotation: Annotation): Promise<readonly string[]> => {
      const plan = await planDeletion(annotation);
      if (plan.brokenLinkPaths.length > 0) {
        return plan.brokenLinkPaths;
      }
      await deleteAnnotation(annotation, plan);
      hideToolbar();
      setActiveId(null);
      return [];
    },
    [planDeletion, deleteAnnotation, hideToolbar],
  );
  const undo = useHighlightUndo(remove);
  const creation = useAnnotationCreation(input, resetSelection, toolbar, select, (value, color) =>
    undo.trackHighlight(color, value.value.anchor ?? toolbar.state?.rect ?? null),
  );
  const recolor = useComposerRecolor(input.recolorAnnotation, hideToolbar);
  const bookmark = useBookmarkAction({
    ...input,
    create: creation.createOwned ?? input.create,
    onCreated: select,
  });
  const currentId = (id: AnnotationId | null): AnnotationId | null =>
    annotations.some((annotation) => annotation.id === id) ? id : null;
  const edit = (annotation: Annotation): void => {
    toolbar.hide();
    setEditingId(annotation.id);
    setActiveId(annotation.id);
    creation.pause();
    navigation.clearError();
  };
  // Clicking a highlight offers its actions in place; the side panel opens only to edit it.
  useAnnotationActivations(surface, annotations, (annotation) => {
    select(annotation);
    creation.pause();
    navigation.clearError();
    toolbar.showAnnotation(annotation);
  });
  const anchor = useSelectionAnchor(surface);
  const selectionAnchor = anchor && creation.selection?.value === anchor.draft ? anchor.rect : null;
  return {
    ...creation,
    error: navigation.error ?? creation.error ?? bookmark.problem ?? recolor.error,
    canOpenAnnotation: surface !== null,
    activeAnnotationId: currentId(activeId),
    readingAnnotationId,
    revealedAnnotationId: currentId(revealedId),
    editingAnnotationId: currentId(editingId),
    returnToReading: navigation.returnToReading,
    selectionAnchor,
    toolbar: toolbar.state,
    dismissToolbar: toolbar.hide,
    quoteCitation: source
      ? { title: source.title, ...(source.citation?.id ? { citekey: source.citation.id } : {}) }
      : null,
    remove,
    savedHighlight: undo.savedHighlight,
    undoSavedHighlight: undo.undoSavedHighlight,
    dismissSavedHighlight: undo.dismissSavedHighlight,
    ...(recolor.recolor ? { recolor: recolor.recolor } : {}),
    open: (annotation) => {
      setActiveId(annotation.id);
      navigation.open(annotation);
    },
    edit,
    stopEditing: () => {
      setEditingId(null);
      setActiveId(null);
    },
    canBookmark: bookmark.canBookmark,
    bookmarking: bookmark.bookmarking,
    bookmark: bookmark.bookmark,
    resumeDraft: creation.resumeDraft
      ? () => {
          setEditingId(null);
          creation.resumeDraft?.();
        }
      : null,
  };
}

/** Changing a clicked highlight's colour closes its toolbar; a failure is reported in place. */
function useComposerRecolor(
  recolorAnnotation: ((annotation: Annotation, color: string) => Promise<Annotation>) | undefined,
  hideToolbar: () => void,
): {
  readonly recolor: ((annotation: Annotation, color: HighlightColorKey) => void) | null;
  readonly error: string | null;
} {
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    recolor: recolorAnnotation
      ? (annotation, color) => {
          hideToolbar();
          setError(null);
          void recolorAnnotation(annotation, color).catch((reason: unknown) => {
            signalMdbaseMark("error");
            setError(readerErrorMessage(reason, "Reader could not change its colour."));
          });
        }
      : null,
  };
}
