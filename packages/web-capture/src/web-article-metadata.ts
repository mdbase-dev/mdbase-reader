import {
  cslDate,
  cslName,
  sanitizedCitation,
  type CitationDraft,
  type CslName,
} from "./csl-values.js";
import { arrayValue, jsonLdNames, jsonLdNode, nameOf, stringValue } from "./json-ld.js";
import { all, defined, first, type MetaIndex } from "./meta-tags.js";

/** schema.org article types and the CSL type each becomes. */
const articleJsonLdTypes = new Map([
  ["NewsArticle", "article-newspaper"],
  ["AnalysisNewsArticle", "article-newspaper"],
  ["BackgroundNewsArticle", "article-newspaper"],
  ["OpinionNewsArticle", "article-newspaper"],
  ["ReportageNewsArticle", "article-newspaper"],
  ["ReviewNewsArticle", "article-newspaper"],
  ["BlogPosting", "post-weblog"],
  ["LiveBlogPosting", "post-weblog"],
  ["SocialMediaPosting", "post"],
  ["DiscussionForumPosting", "post"],
  ["Article", "webpage"],
  ["TechArticle", "webpage"],
  ["AdvertiserContentArticle", "webpage"],
  ["SatiricalArticle", "webpage"],
]);

type JsonLdNode = Readonly<Record<string, unknown>>;

/**
 * News and blog articles: schema.org `Article` JSON-LD, else Open Graph and `article:*` tags
 * on a page whose `og:type` is `article`. A title alone is not enough evidence.
 */
export function webArticleCitation(
  document: Document,
  meta: MetaIndex,
  pageUrl: string,
): CitationDraft | undefined {
  const linked = jsonLdNode(document, (type) => articleJsonLdTypes.has(type));
  if (!linked && !declaresArticle(meta)) {
    return undefined;
  }
  const node = linked ?? {};
  const title =
    stringValue(node["headline"]) ??
    stringValue(node["name"]) ??
    first(meta, "og:title", "twitter:title");
  if (!title) {
    return undefined;
  }
  const authors = articleAuthors(node, meta);
  return sanitizedCitation(
    defined({
      type: linked ? jsonLdArticleType(linked) : "webpage",
      title,
      author: authors.length ? authors : undefined,
      issued: cslDate(
        stringValue(node["datePublished"]) ??
          first(meta, "article:published_time", "date", "dc.date", "dcterms.issued"),
      ),
      // An article's `isPartOf` is usually its own WebPage node, so it is not the site's name.
      "container-title": first(meta, "og:site_name") ?? nameOf(node["publisher"]),
      publisher: nameOf(node["publisher"]),
      section: stringValue(node["articleSection"]) ?? first(meta, "article:section"),
      abstract:
        stringValue(node["description"]) ??
        first(meta, "og:description", "description", "twitter:description"),
      language: articleLanguage(document, node, meta),
      keyword: articleKeywords(node, meta),
      URL: pageUrl,
    }),
  );
}

function declaresArticle(meta: MetaIndex): boolean {
  return first(meta, "og:type")?.toLowerCase() === "article" || meta.has("article:published_time");
}

/** JSON-LD authors win; `article:author` is often a profile URL rather than a name. */
function articleAuthors(node: JsonLdNode, meta: MetaIndex): CslName[] {
  const linked = jsonLdNames(node["author"]);
  if (linked.length) {
    return linked;
  }
  return all(meta, "article:author", "author")
    .filter((author) => !/^https?:\/\//iu.test(author))
    .flatMap((author) => {
      const name = cslName(author);
      return name ? [name] : [];
    });
}

function articleLanguage(
  document: Document,
  node: JsonLdNode,
  meta: MetaIndex,
): string | undefined {
  return (
    stringValue(node["inLanguage"]) ??
    first(meta, "og:locale")?.replace("_", "-") ??
    (document.documentElement.lang.trim() || undefined)
  );
}

function articleKeywords(node: JsonLdNode, meta: MetaIndex): string | undefined {
  const keywords = [
    ...arrayValue(node["keywords"]).flatMap((value) =>
      typeof value === "string" ? value.split(",") : [],
    ),
    ...all(meta, "article:tag"),
  ]
    .map((word) => word.trim())
    .filter(Boolean);
  return keywords.length ? [...new Set(keywords)].join(", ") : undefined;
}

function jsonLdArticleType(node: JsonLdNode): string {
  return (
    arrayValue(node["@type"])
      .map((type) => (typeof type === "string" ? articleJsonLdTypes.get(type) : undefined))
      .find(Boolean) ?? "webpage"
  );
}
