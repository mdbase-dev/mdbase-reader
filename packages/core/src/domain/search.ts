import type { SourceId } from "./identity.js";

export type SourceTextMatchKind = "source-note" | "annotation";

export interface SourceTextSearchMatch {
  readonly sourceId: SourceId;
  readonly kinds: readonly SourceTextMatchKind[];
}
