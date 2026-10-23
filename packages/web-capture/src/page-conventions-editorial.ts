import { cslDate, cslName } from "./csl-values.js";
import { arrayValue, isRecord, nameOf, schemaTypes } from "./json-ld.js";
import { first } from "./meta-tags.js";

import type { MetaIndex } from "./meta-tags.js";
import type { AddConvention } from "./page-conventions.js";

export function editorialConventions(
  document: Document,
  url: URL,
  meta: MetaIndex,
  nodes: readonly Readonly<Record<string, unknown>>[],
  add: AddConvention,
): void {
  cnrsClaims(document, url, meta, add);
  onsClaims(document, url, add);
  changelogClaims(document, url, meta, add);
  substackClaims(document, url, nodes, add);
  usenixClaims(url, meta, add);
}

function cnrsClaims(document: Document, url: URL, meta: MetaIndex, add: AddConvention): void {
  if (
    url.hostname !== "lejournal.cnrs.fr" ||
    !/^\/articles\/[^/]+\/?$/u.test(url.pathname) ||
    first(meta, "og:site_name") !== "CNRS Le journal" ||
    !document.querySelector("h1.node-title")
  ) {
    return;
  }
  const bylines = document.querySelectorAll(".date-auteur");
  if (bylines.length !== 1) {
    return;
  }
  const byline = bylines[0];
  const authors = [...(byline?.querySelectorAll('.textformatter-list a[href^="/auteurs/"]') ?? [])]
    .slice(0, 128)
    .flatMap((element) => {
      const name = cslName(element.textContent);
      return name ? [name] : [];
    });
  add(
    "cnrs-journal/article",
    "type",
    "article-magazine",
    "CNRS Le journal article and byline wrapper",
  );
  add("cnrs-journal/article", "author", authors, "article author links, not site Twitter account");
  const date = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(
    byline?.querySelector(".date-display-single")?.textContent.trim() ?? "",
  );
  if (date) {
    add(
      "cnrs-journal/article",
      "issued",
      cslDate(`${date[3] ?? ""}-${date[2] ?? ""}-${date[1] ?? ""}`),
      "French article dateline DD.MM.YYYY",
    );
  }
}

function onsClaims(document: Document, url: URL, add: AddConvention): void {
  if (url.hostname !== "www.ons.gov.uk" || !/^\/.+\/bulletins\/[^/]+\/[^/]+$/u.test(url.pathname)) {
    return;
  }
  // ONS's suggested citation identifies the institutional author; its Article graph
  // sometimes credits the enquiries contact instead. Require this page's citation.
  const citation = [...document.querySelectorAll("p")]
    .slice(0, 256)
    .find(
      (element) =>
        /^Office for National Statistics \(ONS\), released .+, ONS website, statistical bulletin,/u.test(
          element.textContent.replace(/\s+/gu, " ").trim(),
        ) &&
        [...element.querySelectorAll("a[href]")].some((link) =>
          samePage(link.getAttribute("href"), url),
        ),
    );
  if (!citation) {
    return;
  }
  add("ons/bulletin", "type", "report", "ONS statistical bulletin suggested citation");
  add(
    "ons/bulletin",
    "author",
    [{ literal: "Office for National Statistics" }],
    "suggested citation institutional author, not contact",
  );
}

function changelogClaims(document: Document, url: URL, meta: MetaIndex, add: AddConvention): void {
  const episode = /^\/podcast\/([1-9]\d*)$/u.exec(url.pathname)?.[1];
  const title = document
    .querySelector("h1.episode-header-title")
    ?.textContent.replace(/\s+/gu, " ")
    .trim();
  const series = /\(([^()]+) #(\d+)\)$/u.exec(first(meta, "og:title") ?? "");
  if (
    url.hostname !== "changelog.com" ||
    !episode ||
    !title ||
    first(meta, "og:site_name") !== "Changelog" ||
    series?.[2] !== episode
  ) {
    return;
  }
  add(
    "changelog/episode",
    "type",
    "broadcast",
    "podcast episode header and show/episode SEO label",
  );
  add("changelog/episode", "title", title, "episode headline, without guest/show suffix");
  add("changelog/episode", "container-title", series[1], "show label in episode metadata");
  add("changelog/episode", "number", episode, "episode route agrees with metadata");
  add(
    "changelog/episode",
    "publisher",
    first(meta, "copyright"),
    "episode publisher copyright metadata",
  );
  const published = [...document.querySelectorAll(".episode-body-summary-meta li")].find(
    (element) => /^Published\s/u.test(element.textContent.trim()),
  );
  add(
    "changelog/episode",
    "issued",
    cslDate(published?.querySelector("time")?.getAttribute("datetime") ?? undefined),
    "Published time, not Recorded time",
  );
  // The avatar list contains guests AND hosts, without roles. Do not manufacture hosts.
}

function substackClaims(
  document: Document,
  url: URL,
  nodes: readonly Readonly<Record<string, unknown>>[],
  add: AddConvention,
): void {
  if (!/^\/p\/[^/]+\/?$/u.test(url.pathname) || !document.querySelector("h1.post-title")) {
    return;
  }
  for (const node of nodes) {
    const publisher = node["publisher"];
    if (
      !schemaTypes(node).includes("NewsArticle") ||
      !isRecord(publisher) ||
      !/^pub:\d+$/u.test(String(publisher["identifier"])) ||
      !sameOrigin(publisher["url"], url)
    ) {
      continue;
    }
    const authors = arrayValue(node["author"]);
    const byline = authors.some(
      (author) =>
        isRecord(author) &&
        typeof author["url"] === "string" &&
        /^https:\/\/substack\.com\/@[\w-]+$/u.test(author["url"]) &&
        [...document.querySelectorAll(".byline-wrapper a[href]")]
          .slice(0, 128)
          .some((link) => link.getAttribute("href") === author["url"]),
    );
    if (byline) {
      add(
        "substack/post",
        "type",
        "post-weblog",
        "Substack publication identity and profile-linked post byline",
      );
      add(
        "substack/post",
        "container-title",
        nameOf(publisher),
        "Substack publication name (pub identifier), not hosting platform",
      );
    }
  }
}

function usenixClaims(url: URL, meta: MetaIndex, add: AddConvention): void {
  if (
    url.hostname === "www.usenix.org" &&
    /^\/conference\/[^/]+\/technical-sessions\/presentation\/[^/]+$/u.test(url.pathname) &&
    first(meta, "citation_conference_title")?.includes("USENIX") &&
    first(meta, "citation_title") &&
    first(meta, "citation_isbn")
  ) {
    add("usenix/paper", "publisher", "USENIX Association", "USENIX conference proceedings paper");
    // Conference month is not recoverable from year-only Highwire tags.
  }
}

function samePage(value: string | null, url: URL): boolean {
  try {
    return value !== null && new URL(value, url).href === url.href;
  } catch {
    return false;
  }
}

function sameOrigin(value: unknown, url: URL): boolean {
  try {
    return typeof value === "string" && new URL(value).origin === url.origin;
  } catch {
    return false;
  }
}
