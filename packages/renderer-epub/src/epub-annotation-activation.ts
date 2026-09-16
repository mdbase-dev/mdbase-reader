import { annotationId } from "@mdbase-reader/core";

import type { AnnotationId } from "@mdbase-reader/core";
import type { Unsubscribe } from "@mdbase-reader/reading-surface";
import type { EpubNavigator, DecorationObserver } from "@readium/navigator";

export function createEpubAnnotationActivations(navigator: EpubNavigator): {
  readonly subscribe: (listener: (id: AnnotationId) => void) => Unsubscribe;
  readonly destroy: () => void;
} {
  const listeners = new Set<(id: AnnotationId) => void>();
  const observer: DecorationObserver = {
    onDecorationActivated: ({ decoration }) => {
      listeners.forEach((listener) => listener(annotationId(decoration.id)));
      return true;
    },
  };
  navigator.registerDecorationObserver("mdbase-reader-annotations", observer);
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => {
      navigator.unregisterDecorationObserver(observer);
      listeners.clear();
    },
  };
}
