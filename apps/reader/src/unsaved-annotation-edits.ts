import type { Annotation } from "@mdbase-reader/core";

const pending = new Map<object, Pick<Annotation, "collectionId" | "sourceId">>();
const listeners = new Set<() => void>();
export function trackAnnotationEdits(
  owner: object,
  annotation: Pick<Annotation, "collectionId" | "sourceId">,
  dirty: boolean,
): void {
  if (pending.has(owner) === dirty) {
    return;
  }
  if (dirty) {
    pending.set(owner, annotation);
  } else {
    pending.delete(owner);
  }
  listeners.forEach((listener) => listener());
}
export function hasUnsavedAnnotationEdits(collection: string, source: string): boolean {
  return [...pending.values()].some(
    (item) => item.collectionId === collection && item.sourceId === source,
  );
}
export function subscribeAnnotationEdits(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if (pending.size) {
      event.preventDefault();
    }
  });
}
