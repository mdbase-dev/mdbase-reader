import type { CitationDraft } from "./csl-values.js";
import type { CslProvenance } from "@mdbase-reader/core";

/**
 * Field-level citation evidence. Sources report claims; only the resolver turns them into a
 * citation. See docs/architecture/citation-claims.md.
 */

export type PageSignal = "json-ld" | "highwire" | "open-graph" | "dublin-core" | "html";

export type ClaimSource =
  /** An identifier registry's record: authoritative for the fields it has. */
  | { readonly kind: "registry"; readonly name: "doi.org" | "isbn" | "pubmed" }
  /** A translator written for this site, e.g. Zotero's "Wikipedia" reached through Citoid. */
  | { readonly kind: "site-adapter"; readonly name: string }
  /** Tags and markup on the captured page itself. */
  | { readonly kind: "page"; readonly signal: PageSignal }
  /** A remote service's generic extraction, e.g. Citoid's Embedded Metadata fallback. */
  | { readonly kind: "generic-remote"; readonly name: string }
  /** The user's own value: an edit in Reader, an edit outside it, or a deliberate removal. */
  | { readonly kind: "user" };

export interface Claim {
  /** A CSL variable name: `title`, `author`, `issued`, `container-title`, … */
  readonly field: string;
  /**
   * Already in CSL form. Name variables carry the whole list as one claim. `undefined` only on a
   * `user` claim, where it records a deliberate removal.
   */
  readonly value: unknown;
  readonly source: ClaimSource;
  /** Where exactly: `headline`, `name`, `h1`, `title suffix`, `og:title`, `RIS export`, … */
  readonly evidence?: string;
  /** ISO time the described content was observed; freshness settles exact score ties only. */
  readonly observedAt: string;
}

/** Identifiers a source noticed, which can trigger registry lookups. */
export interface ClaimIdentifiers {
  readonly doi?: string;
  readonly arxiv?: string;
  readonly isbn?: string;
  readonly pmid?: string;
  readonly pmcid?: string;
}

export type ProviderName = "doi.org" | "citoid" | "translation-server";

export type ProviderResult =
  | "ok"
  | "mismatch"
  | "uncertain"
  | "not-found"
  | "rate-limited"
  | "blocked"
  | "timeout"
  | "failed"
  | "cancelled";

/** One remote lookup's outcome, for diagnostics. Never carries URLs, values or messages. */
export interface ProviderOutcome {
  readonly provider: ProviderName;
  readonly result: ProviderResult;
  readonly elapsedMs: number;
  /** From `Retry-After`, when the provider rate-limited the request. */
  readonly retryAfterMs?: number;
}

/** What one source contributes: its claims, any identifiers it found, and, if remote, how it went. */
export interface ClaimBatch {
  readonly claims: readonly Claim[];
  /** Snapshot time, including captures such as challenge pages that supply no claims. */
  readonly observedAt?: string;
  readonly identifiers?: ClaimIdentifiers;
  /** A PDF the page links, from `citation_pdf_url`. Not a citation field. */
  readonly pdfUrl?: string;
  readonly outcome?: ProviderOutcome;
}

/** A value the resolver proposes but will not write without an explicit save. */
export interface CitationSuggestion {
  readonly field: string;
  /** `fill`: the field is empty and was not removed. `change`: it replaces an existing value. */
  readonly reason: "fill" | "change";
  readonly proposed: unknown;
  readonly current?: unknown;
  readonly source: ClaimSource;
  readonly evidence?: string;
}

export interface ResolverInput {
  readonly claims: readonly Claim[];
  /**
   * The record's current citation, when there is one. Its fields become `user` claims unless
   * `provenance` explains them; explained fields compete as their recorded source.
   */
  readonly existing?: {
    readonly citation: Readonly<Record<string, unknown>>;
    readonly provenance?: CslProvenance;
  };
}

export interface Resolution {
  /** `null` when the claims hold no title-level evidence of a work. */
  readonly citation: CitationDraft | null;
  /** Entries for every field the resolver wrote, pinning the written value. */
  readonly provenance: CslProvenance;
  /** Only when `existing` was given: changes to keep out of `citation` until the user accepts. */
  readonly suggestions: readonly CitationSuggestion[];
}

/** `page:json-ld`, `site-adapter:Wikipedia`, `registry:doi.org`, `user`. */
export function claimSourceLabel(source: ClaimSource): string {
  switch (source.kind) {
    case "page":
      return `page:${source.signal}`;
    case "user":
      return "user";
    default:
      return `${source.kind}:${source.name}`;
  }
}

/** The inverse of {@link claimSourceLabel}; `undefined` for labels it did not produce. */
export function parseClaimSourceLabel(label: string): ClaimSource | undefined {
  if (label === "user") {
    return { kind: "user" };
  }
  const separator = label.indexOf(":");
  const kind = label.slice(0, separator);
  const name = label.slice(separator + 1);
  if (separator <= 0 || !name) {
    return undefined;
  }
  switch (kind) {
    case "page":
      return isPageSignal(name) ? { kind, signal: name } : undefined;
    case "registry":
      return name === "doi.org" || name === "isbn" || name === "pubmed"
        ? { kind, name }
        : undefined;
    case "site-adapter":
    case "generic-remote":
      return { kind, name };
    default:
      return undefined;
  }
}

function isPageSignal(value: string): value is PageSignal {
  return ["json-ld", "highwire", "open-graph", "dublin-core", "html"].includes(value);
}
