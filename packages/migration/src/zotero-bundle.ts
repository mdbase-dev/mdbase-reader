import { array, hash, object, safePath, text, type Fields, type Progress } from "./model.js";
import {
  payload,
  validateAnnotations,
  validateParents,
  validatePayloads,
  zoteroRow,
} from "./zotero-validation.js";
export interface ZoteroRow {
  key: string;
  zotero: Fields;
  csl?: Fields;
  status?: string;
  path?: string;
  files: string[];
}
export interface ZoteroBundle {
  manifest: Fields;
  rows: Record<"items" | "notes" | "annotations" | "attachments" | "collections", ZoteroRow[]>;
  files: Map<string, Blob>;
  payloads: { path: string; bytes: number; sha256: string }[];
  metadata: Map<string, Blob>;
}
export async function readZoteroBundle(
  files: Map<string, Blob>,
  signal: AbortSignal,
  progress: Progress,
): Promise<ZoteroBundle> {
  for (const name of files.keys()) {
    safePath(name);
  }
  const metadata = new Map<string, Blob>();
  const read = async (name: string): Promise<unknown> => {
    signal.throwIfAborted();
    const file = files.get(name);
    if (!file || file.size > 64 * 1024 * 1024) {
      throw new Error(`Missing or oversized ${name}.`);
    }
    metadata.set(name, file);
    return JSON.parse(await file.text()) as unknown;
  };
  const manifest = object(await read("manifest.json"));
  if (manifest["format"] !== "dev.mdbase.reader.zotero-bundle" || manifest["version"] !== 1) {
    throw new Error("Unsupported Zotero bundle version.");
  }
  if (!["complete", "complete-with-warnings"].includes(text(manifest["status"]))) {
    throw new Error("This export is incomplete. Export again in Zotero.");
  }
  const counts = object(manifest["counts"]);
  const rows = {} as ZoteroBundle["rows"];
  for (const name of ["items", "notes", "annotations", "attachments", "collections"] as const) {
    rows[name] = array(await read(`${name}.json`)).map(zoteroRow);
    if (rows[name].length !== counts[name]) {
      throw new Error(`${name} count mismatch.`);
    }
  }
  const warnings = array(manifest["warnings"]).map((w) => object(w));
  validateParents(rows, warnings);
  validateAnnotations(rows);
  const payloads = array(manifest["files"]).map(payload);
  const paths = validatePayloads(rows, payloads, counts, warnings);
  for (const name of files.keys()) {
    if (!metadata.has(name) && !paths.has(name)) {
      throw new Error("Unlisted file in bundle.");
    }
  }
  await verifyPayloads(payloads, files, signal, progress);
  return { manifest, rows, files, payloads, metadata };
}
async function verifyPayloads(
  payloads: ZoteroBundle["payloads"],
  files: Map<string, Blob>,
  signal: AbortSignal,
  progress: Progress,
): Promise<void> {
  for (const [i, file] of payloads.entries()) {
    signal.throwIfAborted();
    progress(`Verifying file ${String(i + 1)} of ${String(payloads.length)}…`);
    const blob = files.get(file.path);
    if (blob?.size !== file.bytes || (await hash(blob)) !== file.sha256) {
      throw new Error(
        `Attachment checksum mismatch (${String(i + 1)}). Nothing has been imported.`,
      );
    }
  }
  signal.throwIfAborted();
}
