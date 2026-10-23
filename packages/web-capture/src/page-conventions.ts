import { cslDate } from "./csl-values.js";
import { first, type MetaIndex } from "./meta-tags.js";

import type { Claim } from "./claims.js";

type AddConvention = (name: string, field: string, value: unknown, evidence: string) => void;

/** Small platform translators, not guesses about an arbitrary site's author or publisher. */
export function pageConventionClaims(
  document: Document,
  pageUrl: string,
  meta: MetaIndex,
  observedAt: string,
  hasIssued: boolean,
): Claim[] {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return [];
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    return [];
  }
  const claims: Claim[] = [];
  const add: AddConvention = (name, field, value, evidence) => {
    if (value !== undefined) {
      claims.push({ field, value, source: { kind: "site-adapter", name }, evidence, observedAt });
    }
  };
  githubRepositoryClaims(url, meta, add);
  mdnReferenceClaims(document, url, meta, hasIssued, add);
  return claims;
}

function githubRepositoryClaims(url: URL, meta: MetaIndex, add: AddConvention): void {
  // GitHub's root repository page advertises its owner/name in the OG title. README
  // headings and the SEO description are not the repository's title. Do not apply this
  // to issues, profiles, topic lists or another site's copy of GitHub's tags.
  if (url.hostname !== "github.com" || first(meta, "og:site_name") !== "GitHub") {
    return;
  }
  const repository = /^\/([\w-]+)\/([\w.-]+)\/?$/u.exec(url.pathname);
  const owner = repository?.[1];
  const name = repository?.[2];
  const title = first(meta, "og:title");
  if (!owner || !name || !title) {
    return;
  }
  const identity = `${owner}/${name}`;
  const prefix = `GitHub - ${identity}`;
  if (title === prefix || title.startsWith(`${prefix}: `)) {
    add("github/repository", "type", "software", "repository root + og:title");
    add("github/repository", "title", identity, "repository root + og:title");
    // A namespace is not necessarily an author (especially for forks). No creator
    // claim without an explicit byline or structured creator metadata.
  }
}

function mdnReferenceClaims(
  document: Document,
  url: URL,
  meta: MetaIndex,
  hasIssued: boolean,
  add: AddConvention,
): void {
  // MDN reference documents are collectively maintained and published by Mozilla.
  if (
    url.hostname !== "developer.mozilla.org" ||
    !/^\/[a-z]{2}(?:-[a-z]{2})?\/docs\/.+/iu.test(url.pathname) ||
    first(meta, "og:site_name") !== "MDN Web Docs" ||
    !document.querySelector("h1")
  ) {
    return;
  }
  add("mdn/reference", "publisher", "Mozilla", "MDN reference publisher");
  const footers = document.querySelectorAll(".article-footer__last-modified");
  const footer = footers.length === 1 ? footers[0] : undefined;
  const contributor = footer?.querySelector("a[href]");
  const name = contributor?.textContent.replace(/\s+/gu, " ").trim();
  if (!footer || name !== "MDN contributors" || !mdnContributorsLink(contributor, url)) {
    return;
  }
  add("mdn/reference", "author", [{ literal: name }], "document contributors link");
  // A revision date is a fallback for this mutable reference, never a reason to
  // replace an explicit publication date. The link must belong to this document.
  const times = footer.querySelectorAll("time[datetime]");
  if (!hasIssued && times.length === 1) {
    add(
      "mdn/reference",
      "issued",
      cslDate(times[0]?.getAttribute("datetime") ?? undefined),
      "reference last-modified time",
    );
  }
}

function mdnContributorsLink(link: Element | null | undefined, url: URL): boolean {
  try {
    const target = new URL(link?.getAttribute("href") ?? "", url);
    return (
      target.origin === url.origin &&
      target.pathname === `${url.pathname.replace(/\/$/u, "")}/contributors.txt`
    );
  } catch {
    return false;
  }
}

/** Stack Exchange's numeric question permalink convention, not any /questions/ route. */
export function isStackExchangeQuestion(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ([
        "stackoverflow.com",
        "superuser.com",
        "serverfault.com",
        "askubuntu.com",
        "mathoverflow.net",
      ].includes(host.replace(/^meta\./u, "")) ||
        /^[a-z0-9-]+(?:\.meta)?\.stackexchange\.com$/u.test(host) ||
        /^[a-z]{2}(?:\.meta)?\.stackoverflow\.com$/u.test(host)) &&
      /^\/questions\/[1-9]\d*(?:\/[^/]+)?\/?$/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}
