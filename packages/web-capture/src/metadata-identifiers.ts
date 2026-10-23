import { arxivIdentifier, doiFromText, doiFromUrl } from "./doi.js";
import { stringValue } from "./json-ld.js";
import { first, type MetaIndex } from "./meta-tags.js";

export function embeddedDoi(
  meta: MetaIndex,
  linked: Readonly<Record<string, unknown>> | undefined,
  pageUrl: string,
): string | undefined {
  return (
    doiFromText(first(meta, "citation_doi", "prism.doi", "dc.identifier", "dcterms.identifier")) ??
    doiFromUrl(pageUrl) ??
    doiFromText(stringValue(linked?.["identifier"]) ?? stringValue(linked?.["@id"])) ??
    arxivDoi(first(meta, "citation_arxiv_id") ?? arxivIdentifier(pageUrl))
  );
}

export function arxivDoi(identifier: string | undefined): string | undefined {
  const bare = identifier?.replace(/^arxiv:/iu, "").replace(/v\d+$/u, "");
  return bare ? `10.48550/arXiv.${bare}` : undefined;
}

export function absoluteHttps(value: string | undefined, base: string): string | undefined {
  try {
    const url = value ? new URL(value, base) : undefined;
    return url?.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
