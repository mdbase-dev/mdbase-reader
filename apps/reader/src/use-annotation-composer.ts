import { useCallback, useState } from "react";

import { useAnnotationActivations } from "./use-annotation-activations.js";
import {
  useAnnotationCreation,
  type AnnotationCreationController,
  type AnnotationCreationInput,
} from "./use-annotation-creation.js";
import { useAnnotationNavigation } from "./use-annotation-navigation.js";

import type { Annotation, AnnotationId } from "@mdbase-reader/core";
export { saveSelection, subscribeToSelections } from "./annotation-selection.js";
export type { ComposerSelection } from "./annotation-composer-request.js";

export interface AnnotationComposerController extends Omit<AnnotationCreationController, "pause"> {
  readonly canOpenAnnotation: boolean;
  readonly activeAnnotationId: AnnotationId | null;
  readonly revealedAnnotationId: AnnotationId | null;
  readonly editingAnnotationId: AnnotationId | null;
  readonly returnToReading: (() => void) | null;
  readonly open: (annotation: Annotation) => void;
  readonly edit: (annotation: Annotation) => void;
  readonly stopEditing: () => void;
}
export function useAnnotationComposer(
  input: AnnotationCreationInput & { readonly annotations: readonly Annotation[] },
): AnnotationComposerController {
  const { sourceId, surface, annotations } = input;
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
  return {
    ...creation,
    error: navigation.error ?? creation.error,
    canOpenAnnotation: surface !== null,
    activeAnnotationId: currentId(activeId),
    revealedAnnotationId: currentId(revealedId),
    editingAnnotationId: currentId(editingId),
    returnToReading: navigation.returnToReading,
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
    resumeDraft: creation.resumeDraft
      ? () => {
          setEditingId(null);
          creation.resumeDraft?.();
        }
      : null,
  };
}
