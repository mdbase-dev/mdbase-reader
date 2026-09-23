import { object, text, type Fields } from "./model.js";
export function archiveReadwise(value: Fields): Fields {
  const result = { ...value };
  delete result["raw_source_url"];
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
