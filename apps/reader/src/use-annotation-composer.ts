import { useCallback, useState } from "react";

import { useAnnotationActivations } from "./use-annotation-activations.js";
import {
  useAnnotationCreation,
  type AnnotationCreationController,
  type AnnotationCreationInput,
} from "./use-annotation-creation.js";
import { useAnnotationNavigation } from "./use-annotation-navigation.js";
import { useBookmarkAction } from "./use-bookmark-action.js";
import { useSelectionAnchor } from "./use-selection-anchor.js";
import { useSelectionToolbar, type SelectionToolbarState } from "./use-selection-toolbar.js";

import type { QuoteCitation } from "./selection-copy.js";
import type { Annotation, AnnotationDeletionPlan, AnnotationId } from "@mdbase-reader/core";
import type { ViewportRect } from "@mdbase-reader/reading-surface";
export { saveSelection, subscribeToSelections } from "./annotation-selection.js";
export type { ComposerSelection } from "./annotation-composer-request.js";

export interface AnnotationComposerController extends Omit<AnnotationCreationController, "pause"> {
  readonly canOpenAnnotation: boolean;
  readonly activeAnnotationId: AnnotationId | null;
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
}
export function useAnnotationComposer(
  input: AnnotationCreationInput & {
    readonly annotations: readonly Annotation[];
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
  const creation = useAnnotationCreation(input, resetSelection, toolbar, select);
  const bookmark = useBookmarkAction({ ...input, onCreated: select });
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
    error: navigation.error ?? creation.error ?? bookmark.problem,
    canOpenAnnotation: surface !== null,
    activeAnnotationId: currentId(activeId),
    revealedAnnotationId: currentId(revealedId),
    editingAnnotationId: currentId(editingId),
    returnToReading: navigation.returnToReading,
    selectionAnchor,
    toolbar: toolbar.state,
    dismissToolbar: toolbar.hide,
    quoteCitation: source
      ? { title: source.title, ...(source.citation?.id ? { citekey: source.citation.id } : {}) }
      : null,
    remove: async (annotation) => {
      const plan = await input.planDeletion(annotation);
      if (plan.brokenLinkPaths.length > 0) {
        return plan.brokenLinkPaths;
      }
      await input.deleteAnnotation(annotation, plan);
      toolbar.hide();
      setActiveId(null);
      return [];
    },
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
