import { useSyncExternalStore } from "react";

export type AnnotationOwnerPreference = "chapter" | "book";
const key = "mdbase-reader:annotation-owner";
const listeners = new Set<() => void>();
let fallback: AnnotationOwnerPreference | null = null;

export function annotationOwnerPreference(): AnnotationOwnerPreference {
  if (fallback) {
    return fallback;
  }
  try {
    return localStorage.getItem(key) === "book" ? "book" : "chapter";
  } catch {
    return "chapter";
  }
}
export function setAnnotationOwnerPreference(value: AnnotationOwnerPreference): void {
  try {
    localStorage.setItem(key, value);
    fallback = null;
  } catch {
    fallback = value;
  }
  listeners.forEach((listener) => listener());
}
export function useAnnotationOwnerPreference(): AnnotationOwnerPreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    annotationOwnerPreference,
    () => "chapter",
  );
}
