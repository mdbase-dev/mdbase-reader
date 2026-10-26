import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";
import { arxivDoi } from "./metadata-identifiers.js";
import { resolveCitation } from "./resolver.js";

import type { ClaimBatch, ClaimIdentifiers } from "./claims.js";

/** Local-only comparison context. Never sent to a provider. */
export interface RemoteWorkIdentity {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly identifiers?: ClaimIdentifiers;
  readonly url?: string;
}

export type WorkIdentityResult = "same" | "mismatch" | "uncertain";

export function pageWorkIdentity(page: ClaimBatch | null, url: string): RemoteWorkIdentity {
  return {
    citation: resolveCitation({ claims: page?.claims ?? [] }).citation ?? {},
    ...(page?.identifiers ? { identifiers: page.identifiers } : {}),
    url,
  };
}

/** A page's arXiv identity is its preprint, not its embedded related-publication DOI. */
export function workDoi(work: RemoteWorkIdentity): string | undefined {
  const arxiv = workArxiv(work);
  return (
    arxivDoi(arxiv) ??
    doiFromText(work.identifiers?.doi ?? text(work.citation["DOI"])) ??
    (work.url ? doiFromUrl(work.url) : undefined)
  );
}

/** Strong identity first; otherwise a similar title needs an independent bibliographic anchor. */
export function compareRemoteWork(
  page: RemoteWorkIdentity,
  remote: RemoteWorkIdentity,
): WorkIdentityResult {
  return (
    compareDois(page, remote) ?? compareIdentifiers(page, remote) ?? compareTitles(page, remote)
  );
}

function compareDois(
  page: RemoteWorkIdentity,
  remote: RemoteWorkIdentity,
): WorkIdentityResult | undefined {
  const pageDoi = workDoi(page)?.toLowerCase();
  // Do not turn a remote conference record's arXiv backlink into a preprint DOI.
  const remoteDoi = doiFromText(
    remote.identifiers?.doi ?? text(remote.citation["DOI"]),
  )?.toLowerCase();
  if (pageDoi && remoteDoi && pageDoi === remoteDoi) {
    return "same";
  }
  if (pageDoi && remoteDoi) {
    return "mismatch";
  }
  return undefined;
}

function compareIdentifiers(
  page: RemoteWorkIdentity,
  remote: RemoteWorkIdentity,
): WorkIdentityResult | undefined {
  const pageArxiv = workArxiv(page);
  const remoteArxiv = workArxiv(remote);
  if (
    pageArxiv &&
    ["paper-conference", "article-journal", "chapter"].includes(text(remote.citation["type"]) ?? "")
  ) {
    return "mismatch";
  }
  if (pageArxiv && remoteArxiv) {
    return pageArxiv === remoteArxiv ? "same" : "mismatch";
  }
  const pageIsbn = isbn(page);
  const remoteIsbn = isbn(remote);
  if (pageIsbn && remoteIsbn) {
    return pageIsbn === remoteIsbn ? "same" : "mismatch";
  }
  const pageUrls = urls(page);
  if (urls(remote).some((url) => pageUrls.includes(url))) {
    return "same";
  }
  return undefined;
}

function compareTitles(page: RemoteWorkIdentity, remote: RemoteWorkIdentity): WorkIdentityResult {
  const a = titleWords(page.citation["title"]);
  const b = titleWords(remote.citation["title"]);
  if (!a.size || !b.size) {
    return "uncertain";
  }
  const shared = [...a].filter((word) => b.has(word)).length;
  const similarity = (2 * shared) / (a.size + b.size);
  if (similarity < 0.35) {
    return "mismatch";
  }
  const anchored = [firstAuthor, year, container].some((key) => {
    const left = key(page.citation);
    return left !== undefined && left === key(remote.citation);
  });
  return similarity >= 0.85 && anchored ? "same" : "uncertain";
}

/** Mismatches supply neither claims nor new lookup identifiers. Unknown identity stays weak. */
export function checkRemoteWork(batch: ClaimBatch, page: RemoteWorkIdentity): ClaimBatch {
  if (batch.outcome?.result !== "ok" || !batch.claims.length) {
    return batch;
  }
  const identity = compareRemoteWork(page, {
    citation: Object.fromEntries(batch.claims.map(({ field, value }) => [field, value])),
    ...(batch.identifiers ? { identifiers: batch.identifiers } : {}),
  });
  if (identity === "same") {
    return batch;
  }
  const outcome = { ...batch.outcome, result: identity };
  if (identity === "mismatch") {
    return { claims: [], outcome };
  }
  return {
    ...batch,
    outcome,
    claims: batch.claims.map((claim) => ({
      ...claim,
      source: { kind: "generic-remote", name: batch.outcome?.provider ?? "remote" },
    })),
  };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function key(value: unknown): string | undefined {
  return text(value)
    ?.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function titleWords(value: unknown): Set<string> {
  return new Set(key(value)?.split(/\s+/u).filter(Boolean) ?? []);
}

function workArxiv(work: RemoteWorkIdentity): string | undefined {
  const doi = doiFromText(work.identifiers?.doi ?? text(work.citation["DOI"]));
  const id =
    work.identifiers?.arxiv ??
    (work.url ? arxivIdentifier(work.url) : undefined) ??
    arxivIdentifier(text(work.citation["URL"]) ?? "") ??
    /^10\.48550\/arxiv\.(.+)$/iu.exec(doi ?? "")?.[1];
  return id
    ?.replace(/^arxiv:/iu, "")
    .replace(/v\d+$/u, "")
    .toLowerCase();
}

function isbn(work: RemoteWorkIdentity): string | undefined {
  return text(work.identifiers?.isbn ?? work.citation["ISBN"])
    ?.replace(/[^\dX]/giu, "")
    .toUpperCase();
}

function urls(work: RemoteWorkIdentity): string[] {
  return [work.url, text(work.citation["URL"])].flatMap((value) => {
    try {
      const url = new URL(value ?? "");
      if (!["http:", "https:"].includes(url.protocol)) {
        return [];
      }
      url.protocol = "https:";
      url.hash = "";
      return [url.href];
    } catch {
      return [];
    }
  });
}

function firstAuthor(citation: Readonly<Record<string, unknown>>): string | undefined {
  const names = citation["author"];
  const first: unknown = Array.isArray(names) ? names[0] : undefined;
  return key(object(first)?.["family"]);
}

function year(citation: Readonly<Record<string, unknown>>): string | undefined {
  const parts = object(citation["issued"])?.["date-parts"];
  const first: unknown = Array.isArray(parts) ? parts[0] : undefined;
  const value: unknown = Array.isArray(first) ? first[0] : undefined;
  return typeof value === "number" || typeof value === "string" ? String(value) : undefined;
}

function container(citation: Readonly<Record<string, unknown>>): string | undefined {
  return key(citation["container-title"]);
}

function object(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
