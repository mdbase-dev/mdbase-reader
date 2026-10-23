import {
  cslFieldKinds,
  cslFieldStatuses,
  cslValuesEqual,
  maxRejectedCslValues,
  parseCslProvenance,
  validateCslItem,
} from "@mdbase-reader/core";

import {
  claimDateParts,
  claimMatchKey,
  claimValuesMatch,
  compareText,
  dateSpecificity,
  fillGivenNames,
  splitTitle,
  valueKey,
  withoutRoleNames,
} from "./claim-matching.js";
import { claimSourceLabel, parseClaimSourceLabel } from "./claims.js";
import { doiFromUrl } from "./doi.js";

import type { Claim, CitationSuggestion, Resolution, ResolverInput } from "./claims.js";
import type { CitationDraft } from "./csl-values.js";
import type { CslFieldProvenance, CslProvenance } from "@mdbase-reader/core";

// Each independent signal after the first adds 4 points. Score precedes observation time;
// freshness only settles exact ties. User decisions are pinned regardless of corroboration;
// other ranks are starting scores, not vetoes.
const sourceStrength = {
  user: 100,
  registry: 80,
  "site-adapter": 60,
  page: 40,
  "generic-remote": 40,
};
const corroborationBonus = 4;

interface CandidateClaim extends Claim {
  readonly siteSuffixStripped?: boolean;
  readonly ambiguousDate?: boolean;
}

interface ClaimGroup {
  readonly claims: readonly CandidateClaim[];
  readonly winner: CandidateClaim;
  readonly value: unknown;
  readonly score: number;
  readonly observedAt: number;
}

/** Resolve evidence without network access, mutation, or silently enriching an existing CSL. */
export function resolveCitation(input: ResolverInput): Resolution {
  const existing = input.existing;
  const previous = parseCslProvenance(existing?.provenance);
  const statuses = existing ? cslFieldStatuses(existing.citation, previous) : {};
  const currentClaims = existing ? existingClaims(existing.citation, statuses) : [];
  const claims = [...prepareClaims(input.claims), ...currentClaims];
  const fields = [...new Set(claims.map((claim) => claim.field))].sort(compareText);
  const citation: Record<string, unknown> = {};
  const provenance: Record<string, CslFieldProvenance> = {};
  const suggestions: CitationSuggestion[] = [];

  for (const field of fields) {
    const groups = groupClaims(claims.filter((claim) => claim.field === field));
    const chosen = chooseGroup(field, groups);
    if (chosen?.value === undefined) {
      continue;
    }
    citation[field] = chosen.value;
    provenance[field] = explainGroup(chosen, groups);
    if (existing && statuses[field]?.kind !== "removed") {
      const suggestion = suggestChange(chosen, existing.citation[field]);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }
  }

  if (existing) {
    return {
      // Existing CSL is canonical, including omissions and deliberate external edits.
      citation: existing.citation as CitationDraft,
      provenance: existingProvenance(existing.citation, statuses),
      suggestions,
    };
  }
  if (typeof citation["title"] !== "string" || !citation["title"].trim()) {
    return { citation: null, provenance: {}, suggestions: [] };
  }
  if (citation["type"] === undefined) {
    citation["type"] = "webpage";
    // The conservative HTML baseline stays weak enough for a later, specific type to win.
    provenance["type"] = { value: "webpage", source: "page:html" };
  }
  return { citation: citation as CitationDraft, provenance, suggestions: [] };
}

function suggestChange(chosen: ClaimGroup, current: unknown): CitationSuggestion | undefined {
  if (cslValuesEqual(current, chosen.value) || chosen.winner.source.kind === "user") {
    return undefined;
  }
  return {
    field: chosen.winner.field,
    reason: emptyField(current) ? "fill" : "change",
    proposed: chosen.value,
    ...(current !== undefined ? { current } : {}),
    source: chosen.winner.source,
    ...(chosen.winner.evidence ? { evidence: chosen.winner.evidence } : {}),
  };
}

function emptyField(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && !value.length)
  );
}

function existingClaims(
  citation: Readonly<Record<string, unknown>>,
  statuses: ReturnType<typeof cslFieldStatuses>,
): Claim[] {
  return Object.entries(statuses).flatMap(([field, status]) => {
    if (status.kind === "unexplained" && emptyField(citation[field])) {
      return [];
    }
    const value = citation[field];
    if (status.kind !== "explained") {
      return [{ field, value, source: { kind: "user" }, observedAt: existingObservation }];
    }
    // The evidence that agreed when the value was chosen still backs it against a later lookup.
    // An agreed label naming no known source earns nothing; it must not outrank as the user.
    return [...new Set([status.provenance.source, ...(status.provenance.agreed ?? [])])].flatMap(
      (label, index) => {
        const space = label.indexOf(" ");
        const source = parseClaimSourceLabel(space === -1 ? label : label.slice(0, space));
        const evidence = space === -1 ? undefined : label.slice(space + 1);
        if (!source && index > 0) {
          return [];
        }
        return [
          {
            field,
            value,
            source: source ?? { kind: "user" as const },
            ...(evidence ? { evidence } : {}),
            observedAt: existingObservation,
          },
        ];
      },
    );
  });
}

/** The stored value's observation time is unknown, so it is treated as the oldest. */
const existingObservation = "";

function prepareClaims(claims: readonly Claim[]): CandidateClaim[] {
  const prepared: CandidateClaim[] = [];
  for (const claim of claims) {
    let value = claim.value;
    if (value === undefined) {
      if (claim.source.kind === "user") {
        prepared.push(claim);
      }
      continue;
    }
    prepared.push(...titleCandidates(claim, claims));
    if ((claim.field === "author" || claim.field === "editor") && claim.source.kind !== "user") {
      value = withoutRoleNames(value);
      if (Array.isArray(value) && !value.length) {
        continue;
      }
    }
    if (validField(claim.field, value)) {
      prepared.push({ ...claim, value });
    }
  }
  return prepared;
}

function titleCandidates(claim: Claim, claims: readonly Claim[]): CandidateClaim[] {
  if (!pageTitleSignal(claim) || typeof claim.value !== "string") {
    return [];
  }
  const candidates: CandidateClaim[] = [];
  let candidate = splitTitle(claim.value);
  const container = supportedSuffix(candidate.suffix, claim, claims);
  if (container) {
    candidates.push({ ...claim, field: "container-title", value: container });
  }
  let outermost = true;
  while (candidate.suffix) {
    if (
      (outermost && container) ||
      claims.some(
        (other) =>
          other.field === "title" &&
          !pageTitleSignal(other) &&
          claimValuesMatch("title", candidate.title, other.value),
      )
    ) {
      candidates.push({ ...claim, value: candidate.title, siteSuffixStripped: !!container });
    }
    candidate = splitTitle(candidate.title);
    outermost = false;
  }
  return candidates;
}

function pageTitleSignal(claim: Claim): boolean {
  return (
    claim.field === "title" &&
    claim.source.kind === "page" &&
    ((claim.source.signal === "html" && claim.evidence === "title") ||
      (claim.source.signal === "open-graph" &&
        ["og:title", "twitter:title"].includes(claim.evidence ?? "")))
  );
}

function supportedSuffix(
  suffix: string | undefined,
  title: Claim,
  claims: readonly Claim[],
): string | undefined {
  if (!suffix) {
    return undefined;
  }
  const containers = claims.filter(
    (claim) => claim.field === "container-title" && !/publisher/iu.test(claim.evidence ?? ""),
  );
  if (containers.length) {
    return containers.some((claim) => claimValuesMatch("container-title", suffix, claim.value))
      ? suffix
      : undefined;
  }
  const key = suffix.toLowerCase().replace(/[^a-z0-9]/gu, "");
  const hostMatches = claims.some((claim) => {
    if (claim.field !== "URL" || claim.source.kind !== "page" || typeof claim.value !== "string") {
      return false;
    }
    try {
      return new URL(claim.value).hostname.split(".").some((part) => part === key);
    } catch {
      return false;
    }
  });
  const repeated = claims.some(
    (claim) =>
      pageTitleSignal(claim) &&
      evidenceLabel(claim) !== evidenceLabel(title) &&
      typeof claim.value === "string" &&
      claimValuesMatch("container-title", suffix, splitTitle(claim.value).suffix) &&
      !claimValuesMatch("title", claim.value, title.value),
  );
  return hostMatches || repeated ? suffix : undefined;
}

function validField(field: string, value: unknown): boolean {
  if (value === "" || (typeof value === "string" && !value.trim())) {
    return false;
  }
  if (field !== "id" && field !== "type" && !cslFieldKinds.has(field)) {
    return false;
  }
  return validateCslItem({ id: "candidate", type: "webpage", [field]: value }).valid;
}

/** A partial date shared by conflicting anchors stands alone, not in either anchor's group. */
function groupClaims(claims: readonly CandidateClaim[]): ClaimGroup[] {
  const groups: CandidateClaim[][] = [];
  const exact = new Map<string, CandidateClaim[]>();
  const dates = new DateGroupIndex();
  const ordered = [...claims].sort(
    (a, b) => dateSpecificity(b.value) - dateSpecificity(a.value) || compareClaims(a, b),
  );
  for (const claim of ordered) {
    const parts = cslFieldKinds.get(claim.field) === "date" && claimDateParts(claim.value);
    if (parts) {
      dates.add(claim, parts, groups);
      continue;
    }
    const key = claimMatchKey(claim.field, claim.value);
    const group = key === undefined ? undefined : exact.get(key);
    if (group) {
      group.push(claim);
    } else {
      const created = [claim];
      groups.push(created);
      if (key !== undefined) {
        exact.set(key, created);
      }
    }
  }
  return groups.flatMap((group) => {
    const ranked = [...group].sort(compareClaims);
    // Equivalent publisher spellings should credit the page that supplies the saved imprint.
    const winner =
      (ranked[0]?.source.kind !== "user"
        ? ranked.find(
            (claim) =>
              claim.field === "publisher" &&
              claim.source.kind === "page" &&
              ["citation_publisher", "dc.publisher", "dcterms.publisher"].includes(
                claim.evidence ?? "",
              ),
          )
        : undefined) ?? ranked[0];
    if (!winner) {
      return [];
    }
    // Generic remote metadata can repeat the very same document title; it is not another
    // independent work heading. Derived title candidates retain their original signal label.
    const hasPageTitle = group.some(pageTitleSignal);
    // Legacy provenance can name only the source, not the winning evidence. That anonymous
    // placeholder is not an independent vote in addition to this source's labelled signals.
    const labelledSources = new Set(
      group.filter((claim) => claim.evidence).map((claim) => claimSourceLabel(claim.source)),
    );
    const independent = new Set(
      group
        .filter(
          (claim) =>
            !(claim.field === "title" && claim.source.kind === "generic-remote" && hasPageTitle) &&
            !(!claim.evidence && labelledSources.has(claimSourceLabel(claim.source))),
        )
        .map(evidenceLabel),
    );
    return [
      {
        claims: ranked,
        winner,
        value: groupValue(winner, ranked),
        score: Math.max(...ranked.map(claimStrength)) + corroborationBonus * (independent.size - 1),
        observedAt: Math.max(...group.map(observationTime)),
      },
    ];
  });
}

type DateParts = NonNullable<ReturnType<typeof claimDateParts>>;
interface DateGroup {
  readonly claims: CandidateClaim[];
  parts: DateParts;
  uniformKey: string | undefined;
}

/**
 * Date compatibility is not transitive. Index each group's merged constraints by precision
 * and prefix (at most nine keys for a CSL date range), not by every member. A year can then
 * detect ambiguity in two lookups/hits without endorsing either conflicting full date.
 */
class DateGroupIndex {
  private readonly shapes = new Map<
    string,
    { readonly lengths: readonly number[]; readonly prefixes: Map<string, Set<DateGroup>> }
  >();
  private readonly uniform = new Map<string, DateGroup>();

  add(claim: CandidateClaim, parts: DateParts, groups: CandidateClaim[][]): void {
    const matches: DateGroup[] = [];
    for (const shape of this.shapes.values()) {
      if (shape.lengths.length !== parts.length) {
        continue;
      }
      const key = valueKey(parts.map((part, i) => part.slice(0, shape.lengths[i])));
      for (const group of shape.prefixes.get(key) ?? []) {
        matches.push(group);
        if (matches.length === 2) {
          break;
        }
      }
      if (matches.length === 2) {
        break;
      }
    }
    const key = valueKey(claim.value);
    const ambiguous = matches.length > 1;
    const group = ambiguous ? this.uniform.get(key) : matches[0];
    const candidate = ambiguous ? { ...claim, ambiguousDate: true } : claim;
    if (!group) {
      const created: DateGroup = { claims: [candidate], parts, uniformKey: key };
      groups.push(created.claims);
      this.uniform.set(key, created);
      this.index(created, true);
      return;
    }
    group.claims.push(candidate);
    if (group.uniformKey !== key && group.uniformKey !== undefined) {
      this.uniform.delete(group.uniformKey);
      group.uniformKey = undefined;
    }
    const merged = parts.map((part, i) => {
      const previous = group.parts[i] ?? [];
      return previous.length > part.length ? previous : part;
    });
    if (valueKey(merged) !== valueKey(group.parts)) {
      this.index(group, false);
      group.parts = merged;
      this.index(group, true);
    }
  }

  private index(group: DateGroup, add: boolean): void {
    const lengths = group.parts.map((part) => part.length);
    const shapeKey = lengths.join(",");
    let shape = this.shapes.get(shapeKey);
    if (!shape) {
      shape = { lengths, prefixes: new Map() };
      this.shapes.set(shapeKey, shape);
    }
    let prefixes: DateParts[] = [[]];
    for (const part of group.parts) {
      prefixes = prefixes.flatMap((prefix) =>
        Array.from({ length: part.length }, (_, i) => [...prefix, part.slice(0, i + 1)]),
      );
    }
    for (const prefix of prefixes) {
      const key = valueKey(prefix);
      if (add) {
        const bucket = shape.prefixes.get(key) ?? new Set<DateGroup>();
        bucket.add(group);
        shape.prefixes.set(key, bucket);
      } else {
        const bucket = shape.prefixes.get(key);
        bucket?.delete(group);
        if (!bucket?.size) {
          shape.prefixes.delete(key);
        }
      }
    }
  }
}

function groupValue(winner: Claim, ranked: readonly Claim[]): unknown {
  if (winner.source.kind === "user") {
    return winner.value;
  }
  if (cslFieldKinds.get(winner.field) === "name") {
    return fillGivenNames(
      winner.value,
      ranked.map((claim) => claim.value),
    );
  }
  if (cslFieldKinds.get(winner.field) === "date") {
    return [...ranked].sort(
      (a, b) => dateSpecificity(b.value) - dateSpecificity(a.value) || compareClaims(a, b),
    )[0]?.value;
  }
  return winner.value;
}

function chooseGroup(field: string, groups: readonly ClaimGroup[]): ClaimGroup | undefined {
  let eligible = groups;
  const pinned = groups.filter((group) => group.winner.source.kind === "user");
  if (pinned.length) {
    eligible = pinned;
  } else if (field === "type") {
    // A registry's work type is authoritative. Otherwise prefer a positively identified work
    // type over generic Article/WebPage/document signals, however often defaults are repeated.
    const registered = groups.filter(
      (group) => group.winner.source.kind === "registry" && group.value !== "webpage",
    );
    const specific = groups.filter(
      (group) => !["webpage", "article", "document"].includes(String(group.value)),
    );
    eligible = registered.length ? registered : specific.length ? specific : groups;
  } else if (field === "title") {
    // Registries can omit a section prefix from the published title. Retain the full work
    // title only when both its heading and structured work metadata explicitly agree.
    const expanded = groups.filter(
      (group) =>
        group.claims.some((claim) => claim.source.kind === "page" && claim.evidence === "h1") &&
        group.claims.some(
          (claim) =>
            claim.source.kind === "page" &&
            ((claim.source.signal === "json-ld" &&
              /^[A-Z][A-Za-z]+ (?:headline|name)$/u.test(claim.evidence ?? "")) ||
              (claim.source.signal === "highwire" && claim.evidence === "citation_title")),
        ),
    );
    eligible = groups.filter(
      (group) =>
        !(
          group.winner.source.kind === "registry" &&
          expanded.some(
            (full) =>
              typeof full.value === "string" &&
              claimValuesMatch("title", full.value.replace(/^[^:]+:\s+/u, ""), group.value) &&
              !claimValuesMatch("title", full.value, group.value),
          )
        ),
    );
  } else if (field === "publisher") {
    const imprints = groups.filter(
      (group) =>
        group.claims.some(
          (claim) => claim.source.kind === "page" && claim.evidence === "citation_publisher",
        ) &&
        new Set(
          group.claims.flatMap((claim) =>
            claim.source.kind === "page" ? [claim.source.signal] : [],
          ),
        ).size > 1,
    );
    if (imprints.length) {
      eligible = imprints;
    }
  } else if (field === "container-title") {
    // A publisher-only fallback is not evidence of the publication's name.
    eligible = groups.filter((group) =>
      group.claims.some((claim) => !/publisher/iu.test(claim.evidence ?? "")),
    );
  }
  return [...eligible].sort(
    (a, b) =>
      b.score - a.score ||
      cautiousDateOrder(a, b) ||
      descending(a.observedAt, b.observedAt) ||
      compareClaims(a.winner, b.winner),
  )[0];
}

function cautiousDateOrder(a: ClaimGroup, b: ClaimGroup): number {
  const partialA = a.claims.some((claim) => claim.ambiguousDate);
  const partialB = b.claims.some((claim) => claim.ambiguousDate);
  // A conflicting full date must independently outscore the common prefix, not just be newer.
  return (
    Number(partialB) - Number(partialA) ||
    (partialA && partialB ? dateSpecificity(a.value) - dateSpecificity(b.value) : 0)
  );
}

function claimStrength(claim: CandidateClaim): number {
  // A confirmed site suffix breaks an otherwise exact tie, but never outweighs corroboration.
  let strength = sourceStrength[claim.source.kind] + (claim.siteSuffixStripped ? 1 : 0);
  const urlStrength = urlClaimStrength(claim);
  if (urlStrength !== undefined) {
    return urlStrength;
  }
  if (claim.source.kind === "page") {
    // Work-specific titles survive truncated OG titles corroborated by generic WebPage nodes.
    // Generic Article titles get no bonus: Wikipedia's headline can be a short description.
    if (
      claim.field === "title" &&
      ((claim.source.signal === "json-ld" &&
        /^[A-Z][A-Za-z]+ (?:headline|name)$/u.test(claim.evidence ?? "")) ||
        (claim.source.signal === "highwire" && claim.evidence === "citation_title"))
    ) {
      strength += 12;
    }
    // A combined vocabulary list is complete evidence, not another competing single author.
    if (
      claim.field === "author" &&
      /^(?:dc.creator \+ dcterms.creator|citation_author \+ citation_authors)$/u.test(
        claim.evidence ?? "",
      )
    ) {
      strength += 8;
    }
  }
  return strength;
}

function urlClaimStrength(claim: Claim): number | undefined {
  if (claim.field !== "URL") {
    return undefined;
  }
  if (claim.source.kind !== "user" && doiResolverUrl(claim.value)) {
    return 30;
  }
  return claim.source.kind === "page" &&
    claim.source.signal === "html" &&
    claim.evidence === "page URL"
    ? 28
    : undefined;
}

function doiResolverUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return ["doi.org", "dx.doi.org"].includes(url.hostname) && !!doiFromUrl(value);
  } catch {
    return false;
  }
}

function compareClaims(a: CandidateClaim, b: CandidateClaim): number {
  return (
    claimStrength(b) - claimStrength(a) ||
    descending(observationTime(a), observationTime(b)) ||
    compareText(evidenceLabel(a), evidenceLabel(b)) ||
    compareText(valueKey(a.value), valueKey(b.value))
  );
}

function descending(a: number, b: number): number {
  return a > b ? -1 : a < b ? 1 : 0;
}

function observationTime(claim: Claim): number {
  const time = Date.parse(claim.observedAt);
  return Number.isFinite(time) ? time : -Infinity;
}

/** Both `agreed` and `rejected.from` use `source-label evidence`, with no trailing space. */
function evidenceLabel(claim: Claim): string {
  return `${claimSourceLabel(claim.source)}${claim.evidence ? ` ${claim.evidence}` : ""}`;
}

function explainGroup(chosen: ClaimGroup, groups: readonly ClaimGroup[]): CslFieldProvenance {
  const agreed = [...new Set(chosen.claims.map(evidenceLabel))]
    .filter((label) => label !== evidenceLabel(chosen.winner))
    .sort(compareText);
  const losers = groups.filter((group) => group !== chosen && group.value !== undefined);
  const rejected: { value: unknown; from: string }[] = [];
  while (losers.length && rejected.length < maxRejectedCslValues) {
    const next =
      chooseGroup(chosen.winner.field, losers) ??
      [...losers].sort((a, b) => b.score - a.score || compareClaims(a.winner, b.winner))[0];
    if (!next) {
      break;
    }
    losers.splice(losers.indexOf(next), 1);
    if (!rejected.some((item) => claimValuesMatch(chosen.winner.field, item.value, next.value))) {
      const supplier = next.claims.find((claim) => cslValuesEqual(claim.value, next.value));
      rejected.push({ value: next.value, from: evidenceLabel(supplier ?? next.winner) });
    }
  }
  return {
    value: chosen.value,
    source: evidenceLabel(chosen.winner),
    ...(agreed.length ? { agreed } : {}),
    ...(rejected.length ? { rejected } : {}),
  };
}

function existingProvenance(
  citation: Readonly<Record<string, unknown>>,
  statuses: ReturnType<typeof cslFieldStatuses>,
): CslProvenance {
  return Object.fromEntries(
    Object.entries(statuses)
      .sort(([a], [b]) => compareText(a, b))
      .map(([field, status]) => [
        field,
        status.kind === "explained"
          ? status.provenance
          : status.kind === "removed"
            ? status.previous
            : { value: citation[field], source: "user" },
      ]),
  );
}
