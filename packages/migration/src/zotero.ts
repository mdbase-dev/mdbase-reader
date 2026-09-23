import {
  array,
  format,
  hash,
  identity,
  object,
  stamp,
  text,
  type MigrationPlan,
  type MigrationSource,
} from "./model.js";
import { addZoteroPdfTargets } from "./zotero-anchors.js";
import {
  enrichZoteroSource,
  zoteroAnnotation,
  zoteroNote,
  zoteroSource,
} from "./zotero-records.js";

import type { ZoteroBundle } from "./zotero-bundle.js";
export async function planZotero(bundle: ZoteroBundle): Promise<MigrationPlan> {
  const library = text(object(bundle.manifest["source"])["library"]);
  if (!library) {
    throw new Error("Bundle has no library identity.");
  }
  const namespace = `zotero:${library}`;
  const plan: MigrationPlan = {
    service: "zotero",
    namespace,
    sources: [],
    annotations: [],
    files: [],
    warnings: array(bundle.manifest["warnings"]).map((w) => {
      const warning = object(w);
      return `${text(warning["code"])}: ${text(warning["key"])}`;
    }),
    summary: {
      sources: 0,
      notes: bundle.rows.notes.length,
      annotations: bundle.rows.annotations.length,
      files: bundle.payloads.length,
      bytes: bundle.payloads.reduce((n, f) => n + f.bytes, 0),
    },
  };
  const fallback = stamp(bundle.manifest["startedAt"]);
  const byKey = new Map<string, MigrationSource>();
  for (const row of bundle.rows.items) {
    const source = await zoteroSource(namespace, row.key, row.zotero, fallback);
    enrichZoteroSource(source, row, bundle.rows.collections, plan.warnings);
    byKey.set(row.key, source);
    plan.sources.push(source);
  }
  const owners = await attachFiles(bundle, plan, byKey, fallback);
  for (const row of bundle.rows.notes) {
    const parent = text(row.zotero["parentItem"]);
    let source = byKey.get(parent) ?? owners.get(parent);
    if (!source) {
      source = await zoteroSource(namespace, row.key, row.zotero, fallback);
      plan.sources.push(source);
    }
    plan.annotations.push(await zoteroNote(namespace, row, source, fallback));
  }
  for (const row of bundle.rows.annotations) {
    const attachment = bundle.rows.attachments.find((a) => a.key === row.zotero["parentItem"]);
    const owner = attachment && owners.get(attachment.key);
    if (!attachment || !owner) {
      throw new Error("Missing annotation owner.");
    }
    plan.annotations.push(await zoteroAnnotation(namespace, row, owner, attachment, fallback));
  }
  await addZoteroPdfTargets(bundle, plan);
  await planFiles(bundle, plan);
  if (bundle.rows.attachments.some((a) => a.zotero["contentType"] === "text/html")) {
    plan.warnings.push(
      "HTML snapshot resources are preserved as files; relative assets may not display in Reader yet.",
    );
  }
  plan.warnings.push(
    "Notes become independent source-level annotations, not replacements for source prose. Original CSL IDs are archived; Reader assigns stable, collision-resistant citekeys.",
  );
  plan.summary.sources = plan.sources.length;
  return plan;
}
async function attachFiles(
  bundle: ZoteroBundle,
  plan: MigrationPlan,
  sources: Map<string, MigrationSource>,
  fallback: string,
): Promise<Map<string, MigrationSource>> {
  const owners = new Map<string, MigrationSource>();
  for (const a of bundle.rows.attachments) {
    let owner = sources.get(text(a.zotero["parentItem"]));
    if (!owner) {
      owner = await zoteroSource(plan.namespace, a.key, a.zotero, fallback);
      plan.sources.push(owner);
    }
    owners.set(a.key, owner);
    const imported = object(owner.fields["import"]);
    imported["attachments"] = [
      ...array(imported["attachments"] ?? []),
      { key: a.key, native: a.zotero, status: a.status ?? "unknown" },
    ];
    if (a.path) {
      const f = format(a.path, text(a.zotero["contentType"]));
      const role = ["pdf", "epub", "html"].includes(f)
        ? owner.documents.some((d) => d.role === "primary")
          ? "alternative"
          : "primary"
        : "attachment";
      owner.documents.push({
        fileKey: a.path,
        role,
        format: f,
        label: text(a.zotero["title"], a.path.split("/").at(-1)),
      });
    }
  }
  return owners;
}
async function planFiles(bundle: ZoteroBundle, plan: MigrationPlan): Promise<void> {
  const folder = `files/reader/imports/${await identity(plan.namespace, "files", "zotero")}`;
  for (const f of bundle.payloads) {
    const blob = bundle.files.get(f.path);
    if (!blob) {
      throw new Error("Bundle payload is missing.");
    }
    const attachment = bundle.rows.attachments.find((a) => a.path === f.path);
    plan.files.push({
      key: f.path,
      path: `${folder}/${f.path.split("/").map(encodeURIComponent).join("/")}`,
      bytes: f.bytes,
      digest: `sha256:${f.sha256}`,
      mediaType: text(attachment?.zotero["contentType"], blob.type || "application/octet-stream"),
      load: async (signal) => {
        signal.throwIfAborted();
        if ((await hash(blob)) !== f.sha256) {
          throw new Error("Bundle file changed since preview.");
        }
        signal.throwIfAborted();
        return blob;
      },
    });
  }
  const manifest = bundle.metadata.get("manifest.json");
  if (!manifest) {
    throw new Error("Bundle manifest is missing.");
  }
  const archiveId = (await hash(manifest)).slice(0, 24);
  for (const [name, blob] of bundle.metadata) {
    plan.files.push({
      key: `metadata:${name}`,
      path: `${folder}/exports/${archiveId}/${name}`,
      mediaType: "application/json",
      bytes: blob.size,
      load: (signal) => {
        signal.throwIfAborted();
        return Promise.resolve(blob);
      },
    });
  }
}
