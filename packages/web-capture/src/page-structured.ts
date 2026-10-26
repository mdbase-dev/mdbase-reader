import { cslDate } from "./csl-values.js";
import { arrayValue, jsonLdNames, nameOf, schemaTypes, stringValue } from "./json-ld.js";

import type { PageSignal } from "./claims.js";

type AddClaim = (field: string, value: unknown, signal: PageSignal, evidence: string) => void;

/** Extra bibliographic roles/properties on already page-matched, bounded work nodes. */
export function structuredWorkClaims(node: Readonly<Record<string, unknown>>, add: AddClaim): void {
  add("editor", jsonLdNames(arrayValue(node["editor"]).slice(0, 128)), "json-ld", "editor");
  const types = schemaTypes(node);
  if (types.includes("Legislation")) {
    add("issued", cslDate(stringValue(node["legislationDate"])), "json-ld", "legislationDate");
    add("number", stringValue(node["legislationIdentifier"]), "json-ld", "legislationIdentifier");
  }
  if (types.includes("Report")) {
    add("number", stringValue(node["reportNumber"]), "json-ld", "reportNumber");
  }
  if (types.includes("PodcastEpisode")) {
    const number = node["episodeNumber"];
    add(
      "number",
      typeof number === "number" ? String(number) : stringValue(number),
      "json-ld",
      "episodeNumber",
    );
    add("container-title", nameOf(node["partOfSeries"]), "json-ld", "partOfSeries");
  }
}
