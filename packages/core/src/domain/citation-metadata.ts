import type { CslItem } from "./citation.js";

export type CitationResolutionRequest =
  | { readonly kind: "identifier"; readonly value: string }
  | { readonly kind: "url"; readonly value: string }
  | { readonly kind: "text"; readonly value: string };

export interface CitationProvenance {
  readonly provider: string;
  readonly query: string;
  readonly retrievedAt: string;
}

export interface CitationCandidate {
  readonly citation: CslItem;
  readonly provenance: CitationProvenance;
  readonly warnings: readonly string[];
}
