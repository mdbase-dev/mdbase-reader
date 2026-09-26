export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Fields = Record<string, Json>;
export interface MigrationFile {
  key: string;
  path: string;
  mediaType: string;
  bytes?: number;
  digest?: string;
  /** Must return immutable bytes; implementations verify expected hashes on every read. */
  load(signal: AbortSignal): Promise<Blob>;
}
export interface MigrationRecord {
  key: string;
  id: string;
  path: string;
  fields: Fields;
  body: string;
}
export interface MigrationSource extends MigrationRecord {
  documents: { fileKey: string; role: string; format: string; label: string }[];
}
export interface MigrationAnnotation extends MigrationRecord {
  sourceKey: string;
  fileKey?: string;
}
export interface MigrationPlan {
  service: "zotero" | "readwise";
  namespace: string;
  files: MigrationFile[];
  sources: MigrationSource[];
  annotations: MigrationAnnotation[];
  warnings: string[];
  summary: {
    sources: number;
    notes: number;
    annotations: number;
    files: number;
    bytes: number | null;
    /** Per-category breakdown of what will be imported, when the service distinguishes one. */
    categories?: { label: string; sources: number; annotations: number }[];
  };
}
export type Progress = (message: string) => void;
export function object(value: unknown, label = "object"): Fields {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as Fields;
}
export function array(value: unknown, label = "array"): Json[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as Json[];
}
export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
export function safePath(path: string): string {
  if (
    !path ||
    path.includes("\\") ||
    path.includes(":") ||
    path
      .split("/")
      .some(
        (s) =>
          !s ||
          s === "." ||
          s === ".." ||
          Array.from(s).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
      )
  ) {
    throw new Error("Unsafe import path.");
  }
  return path;
}
export async function hash(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function identity(namespace: string, key: string, prefix = "src"): Promise<string> {
  return `${prefix}_${(await hash(new Blob([JSON.stringify([namespace, key])]))).slice(0, 32)}`;
}
export function stamp(value: unknown, fallback = "1970-01-01T00:00:00.000Z"): string {
  const raw = text(value);
  const parsed = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}
export function quoteBody(quote: string, note: string): string {
  return (
    (quote
      ? quote
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") + "\n\n"
      : "") + note
  );
}
export function jsonFile(key: string, path: string, value: unknown): MigrationFile {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  return {
    key,
    path,
    mediaType: "application/json",
    bytes: blob.size,
    load: (signal) => {
      signal.throwIfAborted();
      return Promise.resolve(blob);
    },
  };
}
export function format(name: string, mime: string): string {
  if (mime === "application/pdf" || /\.pdf$/iu.test(name)) {
    return "pdf";
  }
  if (mime === "application/epub+zip" || /\.epub$/iu.test(name)) {
    return "epub";
  }
  if (mime === "text/html" || /\.html?$/iu.test(name)) {
    return "html";
  }
  return "attachment";
}
