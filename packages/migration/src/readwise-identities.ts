import { text, type Fields } from "./model.js";
import { scalar } from "./readwise-values.js";

export function readwiseHighlightKeys(fields: Fields): string[] {
  if (!["highlight", "note"].includes(text(fields["annotation_type"]))) {
    return [];
  }
  const provenance = fields["import"];
  if (
    !provenance ||
    typeof provenance !== "object" ||
    Array.isArray(provenance) ||
    provenance["service"] !== "readwise"
  ) {
    return [];
  }
  const keys = [text(provenance["key"])];
  const aliases = provenance["aliases"];
  if (Array.isArray(aliases)) {
    keys.push(...aliases.map((alias) => text(alias)));
  }
  for (const raw of [provenance["native"], provenance["supplemental"]]) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    if (raw["category"] === "highlight") {
      keys.push(text(raw["id"]));
    } else if (typeof raw["text"] === "string" && scalar(raw["id"])) {
      keys.push(`v2:${scalar(raw["id"])}`, text(raw["external_id"]));
    }
  }
  return [...new Set(keys.filter(Boolean))];
}
