/**
 * Why each field of a source's `csl` holds its value. Stored beside `csl` under the
 * `csl-provenance` frontmatter key, never inside it: `csl` stays pure CSL JSON for other tools
 * and is canonical. Each entry pins the value it explains, so a value edited outside Reader no
 * longer matches its entry and is treated as the user's. See docs/architecture/citation-claims.md.
 */

/** The frontmatter key that holds a source's {@link CslProvenance}. */
export const cslProvenanceKey = "csl-provenance";

/** A value the resolver considered and did not choose. */
export interface RejectedCslValue {
  readonly value: unknown;
  /** A claim source label, such as `page:json-ld` with evidence `headline`. */
  readonly from: string;
}

export interface CslFieldProvenance {
  /** The value this entry explains, as it was written to `csl`. */
  readonly value: unknown;
  /** The chosen claim's source label, for example `site-adapter:Wikipedia` or `registry:doi.org`. */
  readonly source: string;
  /** Evidence of other claims that agreed with the chosen value, such as `json-ld name` or `h1`. */
  readonly agreed?: readonly string[];
  /** At most two rejected values. Full evidence belongs with the page snapshot. */
  readonly rejected?: readonly RejectedCslValue[];
}

/** Keyed by CSL variable name. `id` and `type` may have entries like any other field. */
export type CslProvenance = Readonly<Record<string, CslFieldProvenance>>;

/** How a field's current `csl` value relates to its provenance entry. */
export type CslFieldStatus =
  /** The value matches the pinned value; the entry explains it. */
  | { readonly kind: "explained"; readonly provenance: CslFieldProvenance }
  /** The value differs from the pinned value: someone edited it, inside or outside Reader. */
  | { readonly kind: "edited"; readonly previous: CslFieldProvenance }
  /** The field is absent but an entry pins a value: someone removed it on purpose. */
  | { readonly kind: "removed"; readonly previous: CslFieldProvenance }
  /** The field has a value and no entry: hand-written, imported, or saved before provenance. */
  | { readonly kind: "unexplained" };
