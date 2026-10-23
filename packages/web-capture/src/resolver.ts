import {
  cslFieldKinds,
  cslFieldStatuses,
  cslValuesEqual,
  maxRejectedCslValues,
  parseCslProvenance,
  validateCslItem,
} from "@mdbase-reader/core";

import {
  claimValuesMatch,
  compareText,
  dateSpecificity,
  fillGivenNames,
  splitTitle,
  valueKey,
  withoutRoleNames,
} from "./claim-matching.js";
import { claimSourceLabel, parseClaimSourceLabel } from "./claims.js";

import type { Claim, CitationSuggestion, Resolution, ResolverInput } from "./claims.js";
import type { CitationDraft } from "./csl-values.js";
import type { CslFieldProvenance, CslProvenance } from "@mdbase-reader/core";

// Each distinct source + evidence after the first adds 4 points. A gap of at most 4 is a
// near-tie, settled by observation time, then score and stable lexical order. User decisions
// are pinned regardless of corroboration; other ranks are starting scores, not vetoes.
const sourceStrength = {
  user: 100,
  registry: 80,
  "site-adapter": 60,
  page: 40,
  "generic-remote": 40,
};
const corroborationBonus = 4;
const nearTie = 4;

interface ClaimGroup {
  readonly claims: readonly Claim[];
  readonly winner: Claim;
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
    if (status.kind !== "removed" && emptyField(citation[field])) {
      return [];
    }
    return [
      {
        field,
        value: citation[field],
        source:
          status.kind === "explained"
            ? (parseClaimSourceLabel(status.provenance.source) ?? { kind: "user" })
            : { kind: "user" },
        observedAt: "",
      },
    ];
  });
}

function prepareClaims(claims: readonly Claim[]): Claim[] {
  const prepared: Claim[] = [];
  for (const claim of claims) {
    let value = claim.value;
    if (value === undefined) {
      if (claim.source.kind === "user") {
        prepared.push(claim);
      }
      continue;
    }
    if (claim.field === "title" && typeof value === "string") {
      const { title, suffix } = splitTitle(value);
      value = title;
      if (suffix && claim.source.kind !== "user") {
        prepared.push({
          ...claim,
          field: "container-title",
          value: suffix,
          evidence: `${claim.evidence ? `${claim.evidence} ` : ""}title suffix`,
        });
      }
    }
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

function validField(field: string, value: unknown): boolean {
  if (value === "" || (typeof value === "string" && !value.trim())) {
    return false;
  }
  if (field !== "id" && field !== "type" && !cslFieldKinds.has(field)) {
    return false;
  }
  return validateCslItem({ id: "candidate", type: "webpage", [field]: value }).valid;
}

/** More specific date anchors go first, so a year cannot bridge two conflicting full dates. */
function groupClaims(claims: readonly Claim[]): ClaimGroup[] {
  const groups: Claim[][] = [];
  const ordered = [...claims].sort(
    (a, b) => dateSpecificity(b.value) - dateSpecificity(a.value) || compareClaims(a, b),
  );
  for (const claim of ordered) {
    const matches = groups.filter((group) =>
      group.every((other) => claimValuesMatch(claim.field, claim.value, other.value)),
    );
    if (!matches.length) {
      groups.push([claim]);
    } else {
      for (const group of matches) {
        group.push(claim);
      }
    }
  }
  return groups.flatMap((group) => {
    const ranked = [...group].sort(compareClaims);
    const winner = ranked[0];
    if (!winner) {
      return [];
    }
    const independent = new Set(group.map(evidenceLabel));
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
    const registered = groups.filter((group) => group.winner.source.kind === "registry");
    const specific = groups.filter(
      (group) => !["webpage", "article", "document"].includes(String(group.value)),
    );
    eligible = registered.length ? registered : specific.length ? specific : groups;
  } else if (field === "container-title") {
    // A publisher-only fallback is not evidence of the publication's name.
    eligible = groups.filter((group) =>
      group.claims.some((claim) => !/publisher/iu.test(claim.evidence ?? "")),
    );
  }
  const bestScore = Math.max(...eligible.map((group) => group.score));
  return eligible
    .filter((group) => group.score >= bestScore - nearTie)
    .sort(
      (a, b) =>
        descending(a.observedAt, b.observedAt) ||
        b.score - a.score ||
        compareClaims(a.winner, b.winner),
    )[0];
}

function claimStrength(claim: Claim): number {
  let strength = sourceStrength[claim.source.kind];
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

function compareClaims(a: Claim, b: Claim): number {
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
      rejected.push({ value: next.value, from: evidenceLabel(next.winner) });
    }
  }
  return {
    value: chosen.value,
    source: claimSourceLabel(chosen.winner.source),
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
