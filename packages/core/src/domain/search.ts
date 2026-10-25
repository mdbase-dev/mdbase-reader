import type { SourceId } from "./identity.js";
import type { SearchDestination } from "./search-destination.js";

export type SourceTextMatchKind = "source-note" | "annotation" | "document";

export interface SourceTextSearchMatch {
  readonly sourceId: SourceId;
  readonly kinds: readonly SourceTextMatchKind[];
  readonly passages?: readonly {
    readonly kind: SourceTextMatchKind;
    readonly text: string;
    readonly path: string;
    readonly destination?: SearchDestination;
  }[];
}
