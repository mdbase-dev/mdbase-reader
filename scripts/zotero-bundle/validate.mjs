import { createReadStream } from "node:fs";
import { readFile, lstat, realpath, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, sep } from "node:path";
import { pathToFileURL } from "node:url";

const fail = (message) => {
  throw new Error(message);
};
export async function validateBundle(directory) {
  const root = await realpath(directory);
  async function safe(relative) {
    if (
      typeof relative !== "string" ||
      relative.includes("\\") ||
      relative.includes(":") ||
      relative
        .split("/")
        .some((s) => !s || s === "." || s === ".." || [...s].some((c) => c.charCodeAt(0) < 32))
    ) {
      fail("Unsafe bundle path");
    }
    let path = root;
    for (const segment of relative.split("/")) {
      path = join(path, segment);
      if ((await lstat(path)).isSymbolicLink()) fail("Symlink in bundle");
    }
    if (!(await realpath(path)).startsWith(root + sep)) fail("Path outside bundle");
    return path;
  }
  const json = async (name) => JSON.parse(await readFile(await safe(name), "utf8"));
  const manifest = await json("manifest.json");
  if (manifest.format !== "dev.mdbase.reader.zotero-bundle" || manifest.version !== 1)
    fail("Unsupported bundle");
  if (!["complete", "complete-with-warnings"].includes(manifest.status)) fail("Incomplete bundle");
  const datasets = {};
  for (const name of ["items", "notes", "annotations", "attachments", "collections"]) {
    datasets[name] = await json(`${name}.json`);
    if (!Array.isArray(datasets[name]) || datasets[name].length !== manifest.counts[name])
      fail(`${name} count mismatch`);
  }
  const entries = ["items", "notes", "annotations", "attachments"].flatMap(
    (name) => datasets[name],
  );
  const keys = new Set(entries.map((row) => row.key));
  if (keys.size !== entries.length) fail("Duplicate item identity");
  const attachmentKeys = new Set(datasets.attachments.map((row) => row.key));
  const collectionKeys = new Set(datasets.collections.map((row) => row.key));
  if (collectionKeys.size !== datasets.collections.length) fail("Duplicate collection identity");
  let orphanRecords = 0;
  for (const row of entries) {
    if (row.zotero.key !== row.key) fail("Item key mismatch");
    const parent = row.zotero.parentItem;
    if (parent && !keys.has(parent)) {
      orphanRecords++;
      if (
        !manifest.warnings.some(
          (w) => w.code === "missing-parent" && w.key === row.key && w.parent === parent,
        )
      )
        fail("Undocumented orphan");
    }
    for (const c of row.zotero.collections || [])
      if (!collectionKeys.has(c)) fail("Missing collection");
  }
  for (const annotation of datasets.annotations) {
    if (!attachmentKeys.has(annotation.zotero.parentItem)) fail("Annotation has no attachment");
    if (annotation.zotero.annotationPosition) JSON.parse(annotation.zotero.annotationPosition);
  }
  for (const c of datasets.collections) {
    const seen = new Set([c.key]);
    let parent = c.zotero.parentCollection;
    while (parent) {
      if (!collectionKeys.has(parent) || seen.has(parent)) fail("Invalid collection ancestry");
      seen.add(parent);
      parent = datasets.collections.find((row) => row.key === parent).zotero.parentCollection;
    }
  }
  const filePaths = new Set();
  let bytes = 0;
  for (const file of manifest.files) {
    if (!file.path.startsWith("files/") || filePaths.has(file.path))
      fail("Invalid or duplicate payload path");
    filePaths.add(file.path);
    const path = await safe(file.path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size !== file.bytes) fail(`Size mismatch: ${file.path}`);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest("hex") !== file.sha256) fail(`Checksum mismatch: ${file.path}`);
    bytes += stat.size;
  }
  let available = 0,
    missing = 0;
  const referenced = new Set();
  for (const a of datasets.attachments) {
    for (const file of a.files) {
      if (!filePaths.has(file) || !file.startsWith(`files/${a.key}/`))
        fail("Unresolved attachment payload");
      referenced.add(file);
    }
    if (a.status === "available") {
      available++;
      if (!a.path || !a.files.includes(a.path)) fail("Missing primary payload");
    } else if (a.status === "linked-url") {
      if (a.path || a.files.length) fail("URL attachment has unexpected payload");
    } else {
      missing++;
      if (!manifest.warnings.some((w) => w.key === a.key && w.code === a.status))
        fail("Undocumented missing file");
    }
  }
  if (
    available !== manifest.counts.availableAttachments ||
    missing !== manifest.counts.missingAttachments ||
    filePaths.size !== manifest.counts.files ||
    referenced.size !== filePaths.size
  )
    fail("Payload totals mismatch");
  async function inventory(relative) {
    const path = await safe(relative);
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = relative + "/" + entry.name;
      if (entry.isDirectory()) await inventory(child);
      else if (!entry.isFile() || !filePaths.has(child)) fail("Unlisted payload or symlink");
    }
  }
  if (filePaths.size) await inventory("files");
  return {
    status: manifest.status,
    counts: manifest.counts,
    bytes,
    orphanRecords,
    checksumsVerified: filePaths.size,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Usage: node validate.mjs /path/to/bundle");
  console.log(JSON.stringify(await validateBundle(process.argv[2]), null, 2));
}
