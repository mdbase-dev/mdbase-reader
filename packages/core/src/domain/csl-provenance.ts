import { isJsonValue, isObject } from "./citation-validation.js";

/**
 * Why each field of a source's `csl` holds its value. Stored beside `csl` under the
 * `csl-provenance` frontmatter key, never inside it: `csl` stays pure CSL JSON for other tools
 * and is canonical. Explanations pin their chosen value, so an external edit no longer matches
 * and is treated as the user's. Dismissal-only entries pin no value. See
 * docs/architecture/citation-claims.md.
 */

/** The frontmatter key that holds a source's {@link CslProvenance}. */
export const cslProvenanceKey = "csl-provenance";

/** A value the resolver did not choose, or the user dismissed (`from: "user"`). */
export interface RejectedCslValue {
  readonly value: unknown;
  /** A claim source label, such as `page:json-ld` with evidence `headline`. */
  readonly from: string;
}

export interface CslFieldExplanation {
  /** The value this entry explains, as it was written to `csl`. */
  readonly value: unknown;
  /** The chosen source label plus optional evidence, e.g. `registry:doi.org DOI` or `parent title`. */
  readonly source: string;
  /** Evidence of other claims that agreed with the chosen value, such as `json-ld name` or `h1`. */
  readonly agreed?: readonly string[];
  /** At most two rejected values, user dismissals first and newest first. */
  readonly rejected?: readonly RejectedCslValue[];
}

/**
 * Dismissed fills need no pinned value. Older parsers safely ignore this entry because it
 * lacks `value` and `source`, rather than mistaking an invented baseline for a removal.
 */
export interface CslFieldDismissals {
  readonly value?: never;
  readonly source?: never;
  readonly agreed?: never;
  readonly rejected: readonly RejectedCslValue[];
}

export type CslFieldProvenance = CslFieldExplanation | CslFieldDismissals;

/** Keyed by CSL variable name. `id` and `type` may have entries like any other field. */
export type CslProvenance = Readonly<Record<string, CslFieldProvenance>>;

/** How a field's current `csl` value relates to its provenance entry. */
export type CslFieldStatus =
  /** The value matches the pinned value; the entry explains it. */
  | { readonly kind: "explained"; readonly provenance: CslFieldExplanation }
  /** The value differs from the pinned value: someone edited it, inside or outside Reader. */
  | { readonly kind: "edited"; readonly previous: CslFieldExplanation }
  /** The field is absent but an entry pins a value: someone removed it on purpose. */
  | { readonly kind: "removed"; readonly previous: CslFieldExplanation }
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
  if (!isObject(value)) {
    return undefined;
  }
  const rejected = rejectedValues(value["rejected"]);
  if (!("value" in value) && !("source" in value)) {
    const dismissed = rejected.filter(({ from }) => from === "user");
    return dismissed.length ? { rejected: dismissed } : undefined;
  }
  const source = value["source"];
  if (
    !("value" in value) ||
    !isJsonValue(value["value"]) ||
    typeof source !== "string" ||
    !source.trim()
  ) {
    return undefined;
  }
  const agreed = Array.isArray(value["agreed"])
    ? value["agreed"].filter((item): item is string => typeof item === "string")
    : [];
  return {
    value: value["value"],
    source,
    ...(agreed.length ? { agreed } : {}),
    ...(rejected.length ? { rejected } : {}),
  };
}

function rejectedValues(value: unknown): RejectedCslValue[] {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is RejectedCslValue =>
            isObject(item) &&
            typeof item["from"] === "string" &&
            "value" in item &&
            isJsonValue(item["value"]),
        )
        .sort((left, right) => Number(right.from === "user") - Number(left.from === "user"))
        .slice(0, maxRejectedCslValues)
    : [];
}

function hasExplanation(entry: CslFieldProvenance | undefined): entry is CslFieldExplanation {
  return entry?.source !== undefined;
}

/**
 * Carry user dismissals across provenance rewrites, even for absent fields. Incoming decisions
 * take priority; resolver alternatives use any remaining slots. This layer only deduplicates
 * structurally: the resolver/editor use claim equivalence when matching proposed values.
 */
export function preserveCslDismissals(next: CslProvenance, previous: CslProvenance): CslProvenance {
  const result = { ...next };
  for (const [field, entry] of Object.entries(previous)) {
    const dismissed = entry.rejected?.filter(({ from }) => from === "user") ?? [];
    if (!dismissed.length) {
      continue;
    }
    const incoming = next[field] ?? entry;
    const candidates = [
      ...(incoming.rejected?.filter(({ from }) => from === "user") ?? []),
      ...dismissed,
      ...(incoming.rejected?.filter(({ from }) => from !== "user") ?? []),
    ];
    const rejected = candidates
      .filter(
        (item, index) =>
          !candidates.slice(0, index).some((other) => cslValuesEqual(item.value, other.value)),
      )
      .slice(0, maxRejectedCslValues);
    result[field] = { ...incoming, rejected };
  }
  return result;
}

/** Structural equality for CSL JSON values; object key order does not matter. */
export function cslValuesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date || right instanceof Date) {
    return (
      left instanceof Date && right instanceof Date && Object.is(left.getTime(), right.getTime())
    );
  }
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
 * Classifies fields present in `citation` or `provenance`, except dismissal-only entries.
 * A field edited in Reader or a text editor no longer matches its pin and reports `edited`.
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
    statuses[field] = !hasExplanation(entry)
      ? { kind: "unexplained" }
      : cslValuesEqual(value, entry.value)
        ? { kind: "explained", provenance: entry }
        : { kind: "edited", previous: entry };
  }
  for (const [field, entry] of Object.entries(provenance)) {
    if (citation[field] === undefined && hasExplanation(entry)) {
      statuses[field] = { kind: "removed", previous: entry };
    }
  }
  return statuses;
}
