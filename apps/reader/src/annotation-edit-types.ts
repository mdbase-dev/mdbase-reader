import type { Annotation } from "@mdbase-reader/core";

export interface AnnotationEditSnapshot {
  readonly status: "loading" | "saved" | "unsaved" | "saving" | "error";
  readonly problem: string | null;
  readonly conflict: Annotation | null;
  readonly locked: boolean;
  readonly editing: boolean;
  readonly textVersion: number;
}
export type PersistAnnotation = (base: Annotation, body: string) => Promise<Annotation>;
