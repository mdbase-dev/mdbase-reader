import { isJsonValue, isObject } from "./citation-validation.js";

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

/** At most this many rejected values are kept per field. */
export const maxRejectedCslValues = 2;

/**
 * Reads `csl-provenance` leniently: malformed entries are dropped one field at a time, so a
 * hand-edited or truncated block only loses the explanations it broke.
 */
export function parseCslProvenance(value: unknown): CslProvenance {
  if (!isObject(value)) {
    return {};
  }
  const entries: Record<string, CslFieldProvenance> = {};
  for (const [field, candidate] of Object.entries(value)) {
    const entry = fieldProvenance(candidate);
    if (entry) {
      entries[field] = entry;
    }
  }
  return entries;
}

function fieldProvenance(value: unknown): CslFieldProvenance | undefined {
  if (!isObject(value) || !("value" in value) || !isJsonValue(value["value"])) {
    return undefined;
  }
  const source = value["source"];
  if (typeof source !== "string" || !source.trim()) {
    return undefined;
  }
  const agreed = Array.isArray(value["agreed"])
    ? value["agreed"].filter((item): item is string => typeof item === "string")
    : [];
  const rejected = Array.isArray(value["rejected"])
    ? value["rejected"]
        .filter(
          (item): item is RejectedCslValue =>
            isObject(item) &&
            typeof item["from"] === "string" &&
            "value" in item &&
            isJsonValue(item["value"]),
        )
        .slice(0, maxRejectedCslValues)
    : [];
  return {
    value: value["value"],
    source,
    ...(agreed.length ? { agreed } : {}),
    ...(rejected.length ? { rejected } : {}),
  };
}

/** Structural equality for CSL JSON values; object key order does not matter. */
export function cslValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => cslValuesEqual(item, right[index]))
    );
  }
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) {
      return false;
    }
    const keys = Object.keys(left).filter((key) => left[key] !== undefined);
    return (
      keys.length === Object.keys(right).filter((key) => right[key] !== undefined).length &&
      keys.every((key) => cslValuesEqual(left[key], right[key]))
    );
  }
  return Object.is(left, right);
}

/**
 * Classifies every field present in `citation` or `provenance`. A field edited anywhere, in
 * Reader or a text editor, no longer matches its pinned value and reports `edited`.
 */
export function cslFieldStatuses(
  citation: Readonly<Record<string, unknown>>,
  provenance: CslProvenance,
): Readonly<Record<string, CslFieldStatus>> {
  const statuses: Record<string, CslFieldStatus> = {};
  for (const [field, value] of Object.entries(citation)) {
    if (value === undefined) {
      continue;
    }
    const entry = provenance[field];
    statuses[field] = !entry
      ? { kind: "unexplained" }
      : cslValuesEqual(value, entry.value)
        ? { kind: "explained", provenance: entry }
        : { kind: "edited", previous: entry };
  }
  for (const [field, entry] of Object.entries(provenance)) {
    if (citation[field] === undefined) {
      statuses[field] = { kind: "removed", previous: entry };
    }
  }
  return statuses;
}
