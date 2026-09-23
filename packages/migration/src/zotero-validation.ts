import { array, object, safePath, text, type Fields } from "./model.js";

import type { ZoteroBundle, ZoteroRow } from "./zotero-bundle.js";
export function zoteroRow(value: unknown): ZoteroRow {
  const row = object(value);
  const key = text(row["key"]);
  const zotero = object(row["zotero"]);
  if (!/^[A-Z0-9]+$/u.test(key) || zotero["key"] !== key) {
    throw new Error("Invalid Zotero identity.");
  }
  return {
    key,
    zotero,
    ...(row["csl"] ? { csl: object(row["csl"]) } : {}),
    ...(typeof row["status"] === "string" ? { status: row["status"] } : {}),
    ...(typeof row["path"] === "string" ? { path: row["path"] } : {}),
    files: row["files"] ? array(row["files"]).map((p) => safePath(text(p))) : [],
  };
}
export function validateParents(rows: ZoteroBundle["rows"], warnings: Fields[]): void {
  const items = [...rows.items, ...rows.notes, ...rows.annotations, ...rows.attachments];
  const keys = new Set(items.map((r) => r.key));
  if (keys.size !== items.length) {
    throw new Error("Duplicate Zotero item identity.");
  }
  const collections = new Map(rows.collections.map((r) => [r.key, r]));
  if (collections.size !== rows.collections.length) {
    throw new Error("Duplicate collection identity.");
  }
  for (const row of items) {
    const parent = text(row.zotero["parentItem"]);
    if (
      parent &&
      !keys.has(parent) &&
      !warnings.some(
        (w) => w["code"] === "missing-parent" && w["key"] === row.key && w["parent"] === parent,
      )
    ) {
      throw new Error("Unreported missing parent.");
    }
    for (const c of array(row.zotero["collections"] ?? [])) {
      if (!collections.has(text(c))) {
        throw new Error("Missing collection.");
      }
    }
  }
  for (const row of rows.collections) {
    const seen = new Set([row.key]);
    let parent = text(row.zotero["parentCollection"]);
    while (parent) {
      if (seen.has(parent) || !collections.has(parent)) {
        throw new Error("Invalid collection ancestry.");
      }
      seen.add(parent);
      parent = text(collections.get(parent)?.zotero["parentCollection"]);
    }
  }
}
export function validateAnnotations(rows: ZoteroBundle["rows"]): void {
  const keys = new Set(rows.attachments.map((r) => r.key));
  for (const row of rows.annotations) {
    if (!keys.has(text(row.zotero["parentItem"]))) {
      throw new Error("Annotation has no attachment.");
    }
    if (row.zotero["annotationPosition"]) {
      object(JSON.parse(text(row.zotero["annotationPosition"])));
    }
  }
}
export function payload(value: unknown): ZoteroBundle["payloads"][number] {
  const f = object(value);
  const path = safePath(text(f["path"]));
  const bytes = f["bytes"];
  const sha256 = text(f["sha256"]);
  if (
    !path.startsWith("files/") ||
    typeof bytes !== "number" ||
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    !/^[a-f0-9]{64}$/u.test(sha256)
  ) {
    throw new Error("Invalid file manifest.");
  }
  return { path, bytes, sha256 };
}
function validateAttachment(
  a: ZoteroRow,
  warnings: Fields[],
  paths: Set<string>,
  referenced: Set<string>,
): void {
  for (const path of a.files) {
    if (!paths.has(path) || !path.startsWith(`files/${a.key}/`)) {
      throw new Error("Invalid attachment payload reference.");
    }
    referenced.add(path);
  }
  if (a.status === "available") {
    if (!a.path || !a.files.includes(a.path)) {
      throw new Error("Missing primary attachment payload.");
    }
  } else if (a.status === "linked-url") {
    if (a.path || a.files.length) {
      throw new Error("URL attachment contains unexpected files.");
    }
  } else if (
    a.path ||
    a.files.length ||
    !warnings.some((w) => w["key"] === a.key && w["code"] === a.status)
  ) {
    throw new Error("Invalid missing attachment.");
  }
}
export function validatePayloads(
  rows: ZoteroBundle["rows"],
  payloads: ZoteroBundle["payloads"],
  counts: Fields,
  warnings: Fields[],
): Set<string> {
  const paths = new Set(payloads.map((f) => f.path));
  const referenced = new Set<string>();
  if (paths.size !== payloads.length || paths.size !== counts["files"]) {
    throw new Error("Payload count mismatch.");
  }
  for (const a of rows.attachments) {
    validateAttachment(a, warnings, paths, referenced);
  }
  const available = rows.attachments.filter((a) => a.status === "available").length;
  const missing = rows.attachments.filter(
    (a) => a.status !== "available" && a.status !== "linked-url",
  ).length;
  if (
    available !== counts["availableAttachments"] ||
    missing !== counts["missingAttachments"] ||
    referenced.size !== paths.size
  ) {
    throw new Error("Attachment totals mismatch.");
  }
  return paths;
}
