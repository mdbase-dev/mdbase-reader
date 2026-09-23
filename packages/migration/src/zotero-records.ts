import { validateCslItem } from "@mdbase-reader/core";

import {
  array,
  identity,
  object,
  quoteBody,
  stamp,
  text,
  type Fields,
  type MigrationAnnotation,
  type MigrationSource,
} from "./model.js";

import type { ZoteroRow } from "./zotero-bundle.js";
export const zoteroTags = (raw: Fields): string[] =>
  array(raw["tags"] ?? [])
    .map((t) => text(object(t)["tag"]))
    .filter(Boolean);
export async function zoteroSource(
  namespace: string,
  key: string,
  raw: Fields,
  fallback: string,
  title = text(raw["title"], "Imported Zotero note"),
): Promise<MigrationSource> {
  const id = await identity(namespace, key);
  const kinds: Record<string, string> = {
    book: "book",
    bookSection: "chapter",
    journalArticle: "paper",
    conferencePaper: "paper",
    newspaperArticle: "article",
    magazineArticle: "article",
    webpage: "webpage",
    blogPost: "post",
    email: "email",
    videoRecording: "video",
    podcast: "podcast",
  };
  return {
    key,
    id,
    path: `sources/imports/${id}.md`,
    body: "",
    documents: [],
    fields: {
      title,
      kind: kinds[text(raw["itemType"])] ?? "document",
      saved_at: stamp(raw["dateAdded"], fallback),
      tags: zoteroTags(raw),
      import: { service: "zotero", namespace, key, native: raw },
      reading: { status: "inbox" },
    },
  };
}
export function enrichZoteroSource(
  source: MigrationSource,
  row: ZoteroRow,
  collections: ZoteroRow[],
  warnings: string[],
): void {
  const raw = row.zotero;
  source.fields["authors"] = array(raw["creators"] ?? [])
    .map((c) => {
      const a = object(c);
      return (
        text(a["name"]) || [text(a["firstName"]), text(a["lastName"])].filter(Boolean).join(" ")
      );
    })
    .filter(Boolean);
  for (const [to, from] of [
    ["url", "url"],
    ["description", "abstractNote"],
    ["language", "language"],
  ] as const) {
    if (text(raw[from])) {
      source.fields[to] = text(raw[from]);
    }
  }
  source.fields["zotero_collections"] = array(raw["collections"] ?? []).map((key) => ({
    key,
    name: text(collections.find((c) => c.key === key)?.zotero["name"]),
  }));
  if (row.csl) {
    object(source.fields["import"])["csl_original"] = row.csl;
    const csl = normalizeZoteroCsl({ ...row.csl, id: `zotero_${source.id.slice(4)}` });
    if (csl) {
      source.fields["csl"] = csl;
    } else {
      warnings.push(`CSL retained in native data but needs review: ${row.key}`);
    }
  }
}
export function normalizeZoteroCsl(csl: Fields): Fields | null {
  const checked = validateCslItem(csl);
  if (checked.valid) {
    return csl;
  }
  const extensions = new Map<string, Fields[string]>();
  for (const problem of checked.problems) {
    if (!problem.message.startsWith("is not a CSL 1.0 field")) {
      return null;
    }
    const field = problem.path.slice(4);
    const value = csl[field];
    if (value !== undefined) {
      extensions.set(field, value);
    }
  }
  const result = Object.fromEntries(Object.entries(csl).filter(([key]) => !extensions.has(key)));
  const existing = object(result["custom"] ?? {});
  if (existing["mdbase_zotero_extensions"] !== undefined) {
    return null;
  }
  result["custom"] = { ...existing, mdbase_zotero_extensions: Object.fromEntries(extensions) };
  return validateCslItem(result).valid ? result : null;
}
export async function zoteroNote(
  namespace: string,
  row: ZoteroRow,
  source: MigrationSource,
  fallback: string,
): Promise<MigrationAnnotation> {
  const id = await identity(namespace, row.key, "ann");
  return {
    key: row.key,
    id,
    path: `annotations/imports/${id}.md`,
    sourceKey: source.key,
    body: text(row.zotero["note"]),
    fields: {
      annotation_type: "note",
      created_at: stamp(row.zotero["dateAdded"], fallback),
      created_by: "zotero",
      tags: zoteroTags(row.zotero),
      import: { service: "zotero", namespace, key: row.key, native: row.zotero },
    },
  };
}
export async function zoteroAnnotation(
  namespace: string,
  row: ZoteroRow,
  owner: MigrationSource,
  attachment: ZoteroRow,
  fallback: string,
): Promise<MigrationAnnotation> {
  const id = await identity(namespace, row.key, "ann");
  const raw = row.zotero;
  const quote = text(raw["annotationText"]);
  const type = text(raw["annotationType"]);
  return {
    key: row.key,
    id,
    path: `annotations/imports/${id}.md`,
    sourceKey: owner.key,
    ...(attachment.path ? { fileKey: attachment.path } : {}),
    body: quoteBody(quote, text(raw["annotationComment"])),
    fields: {
      annotation_type: annotationType(type, quote),
      created_at: stamp(raw["dateAdded"], fallback),
      created_by: "zotero",
      tags: zoteroTags(raw),
      color: text(raw["annotationColor"]),
      locator: { label: text(raw["annotationPageLabel"]) },
      import: { service: "zotero", namespace, key: row.key, native: raw },
      target: {
        ...(quote ? { quote: { exact: quote } } : {}),
        zotero: {
          profile: "zotero-annotation-position-v1",
          position: raw["annotationPosition"] ?? null,
        },
      },
    },
  };
}
function annotationType(type: string, quote: string): string {
  if (type === "image") {
    return "area";
  }
  if (type === "highlight" && !quote) {
    return "note";
  }
  return type || "note";
}
