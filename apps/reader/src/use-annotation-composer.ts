import { useCallback, useRef, useState } from "react";

import { bookmarkRequest } from "./annotation-composer-request.js";
import { readerErrorMessage } from "./errors.js";
import { useAnnotationActivations } from "./use-annotation-activations.js";
import {
  useAnnotationCreation,
  type AnnotationCreationController,
  type AnnotationCreationInput,
} from "./use-annotation-creation.js";
import { useAnnotationNavigation } from "./use-annotation-navigation.js";
import { useSelectionAnchor } from "./use-selection-anchor.js";

import type { Annotation, AnnotationId, SourceId } from "@mdbase-reader/core";
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
  readonly open: (annotation: Annotation) => void;
  readonly edit: (annotation: Annotation) => void;
  readonly stopEditing: () => void;
  /** Whether the document has a current position to bookmark. */
  readonly canBookmark: boolean;
  readonly bookmarking: boolean;
  /** Saves a bookmark at the current reading position and selects it. */
  readonly bookmark: () => void;
}
export function useAnnotationComposer(
  input: AnnotationCreationInput & { readonly annotations: readonly Annotation[] },
): AnnotationComposerController {
  const { sourceId, source, surface, annotations, create } = input;
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
  const creation = useAnnotationCreation(input, resetSelection);
  const bookmarkBusy = useRef(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [bookmarkProblem, setBookmarkProblem] = useState<{
    readonly sourceId: SourceId;
    readonly message: string;
  } | null>(null);
  const bookmark = (): void => {
    const request = source && surface ? bookmarkRequest(source, surface) : null;
    if (!source || !request || bookmarkBusy.current) {
      return;
    }
    bookmarkBusy.current = true;
    setBookmarking(true);
    setBookmarkProblem(null);
    void create(request)
      .then((created) => {
        setActiveId(created.id);
        setRevealedId(null);
        setEditingId(null);
      })
      .catch((reason: unknown) =>
        setBookmarkProblem({
          sourceId: source.id,
          message: readerErrorMessage(reason, "Reader could not save this bookmark."),
        }),
      )
      .finally(() => {
        bookmarkBusy.current = false;
        setBookmarking(false);
      });
  };
  const currentId = (id: AnnotationId | null): AnnotationId | null =>
    annotations.some((annotation) => annotation.id === id) ? id : null;
  const reveal = (annotation: Annotation): void => {
    setActiveId(annotation.id);
    setRevealedId(annotation.id);
    setEditingId(null);
    creation.pause();
    navigation.clearError();
  };
  useAnnotationActivations(surface, annotations, reveal);
  const anchor = useSelectionAnchor(surface);
  const selectionAnchor = anchor && creation.selection?.value === anchor.draft ? anchor.rect : null;
  return {
    ...creation,
    error:
      navigation.error ??
      creation.error ??
      (bookmarkProblem?.sourceId === sourceId ? bookmarkProblem.message : null),
    canOpenAnnotation: surface !== null,
    activeAnnotationId: currentId(activeId),
    revealedAnnotationId: currentId(revealedId),
    editingAnnotationId: currentId(editingId),
    returnToReading: navigation.returnToReading,
    selectionAnchor,
    open: (annotation) => {
      setActiveId(annotation.id);
      navigation.open(annotation);
    },
    edit: (annotation) => {
      setEditingId(annotation.id);
      setActiveId(annotation.id);
      creation.pause();
      navigation.clearError();
    },
    stopEditing: () => {
      setEditingId(null);
      setActiveId(null);
    },
    canBookmark: source !== null && surface !== null,
    bookmarking,
    bookmark,
    resumeDraft: creation.resumeDraft
      ? () => {
          setEditingId(null);
          creation.resumeDraft?.();
        }
      : null,
  };
}
