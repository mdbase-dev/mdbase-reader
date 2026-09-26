import { object, text, type Fields } from "./model.js";
export function archiveReadwise(value: Fields): Fields {
  const result = { ...value };
  delete result["raw_source_url"];
  // A document's saved HTML is imported as its own file; copying it into frontmatter and the
  // native archive would duplicate whole articles. Highlight and note HTML is the annotation.
  if (!["highlight", "note"].includes(text(result["category"]))) {
    delete result["html_content"];
  }
  return result;
}
export function tagNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v : text(object(v)["name"]))).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, v]) =>
      typeof v === "string" ? v : v && typeof v === "object" ? text(object(v)["name"], key) : key,
    );
  }
  return [];
}
export function plain(html: string): string {
  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(html, "text/html").body.textContent;
  }
  return html.replace(/<[^>]*>/gu, "");
}
export function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
/** Counts items left out of an import so each reason becomes one counted warning. */
export class SkipTally {
  private counts = new Map<string, number>();
  add(reason: string, count = 1): void {
    if (count > 0) {
      this.counts.set(reason, (this.counts.get(reason) ?? 0) + count);
    }
  }
  warnings(): string[] {
    return [...this.counts].map(([reason, count]) => `${reason}: ${count.toLocaleString("en")}`);
  }
}
