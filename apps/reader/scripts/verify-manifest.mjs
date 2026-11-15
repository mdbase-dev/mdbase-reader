import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { applyTypePack, assessTypePack, loadCatalog, validateRecord } from "@mdbase-dev/mdbase";

import { assertValidReaderManifest } from "./validate-manifest.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(projectRoot, "public", ".well-known", "mdbase-app.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assertValidReaderManifest(manifest);
const packs = manifest.provisions?.type_packs ?? [];
const provided = packs.flatMap((pack) =>
  pack.provides.map(({ id, version }) => `${id}@${version}`),
);
const required = manifest.requirements.contracts.map(({ id, version }) => `${id}@${version}`);
if (provided.sort().join() !== required.sort().join()) {
  fail("Reader's type packs must provide exactly its required contracts.");
}

for (const pack of packs) {
  const documents = new Map(pack.resources.map((resource) => [resource.source, resource.document]));
  for (const resource of pack.manifest.resources) {
    const document = documents.get(resource.source);
    if (!document) {
      fail(`Type-pack source '${resource.source}' is missing.`);
    }
    if (digest(document) !== resource.digest) {
      fail(`Type-pack source '${resource.source}' does not match its digest.`);
    }
  }
}

// An empty collection, as its files by collection path. The helpers return each pack's writes.
const collection = { "mdbase.yaml": "spec_version: 0.3.0\n" };
for (const pack of packs) {
  const input = {
    pack: {
      manifest: JSON.stringify(pack.manifest),
      sources: Object.fromEntries(pack.resources.map(({ source, document }) => [source, document])),
    },
    options: { installed_by: manifest.id },
  };
  const assessment = await assessTypePack({ ...input, resources: collection });
  if (assessment.status !== "install" || !assessment.applicable) {
    fail(
      `${pack.manifest.id} should install into an empty collection, not '${assessment.status}': ${describe(assessment.issues)}`,
    );
  }
  const installed = await applyTypePack({
    ...input,
    resources: collection,
    expectedDigest: assessment.assessment_digest,
  });
  for (const { path, document } of installed.writes) collection[path] = document;
}

const catalog = await loadCatalog(collection);
if (!catalog.valid) {
  fail(`Installed collection has an invalid catalog: ${describe(catalog.issues)}`);
}
const implementations = new Map();
for (const requirement of manifest.requirements.contracts) {
  const found = catalog.implementations.filter(
    ({ contract, version }) => contract === requirement.id && version === requirement.version,
  );
  if (found.length !== 1) {
    fail(`${requirement.id} should have exactly one starter implementation.`);
  }
  implementations.set(requirement.id, found[0]);
}
// Each record is valid as its starter type, and the contract reads the asserted field from the
// record field of the same name, so the contract view carries the record's value.
for (const [path, source, type, contract, field] of [
  [
    "sources/example.md",
    [
      "---",
      "type: reader-source",
      "id: src_01K2A6Y4G7C8R1DYN4JP59VX5B",
      "title: Example source",
      "kind: document",
      "saved_at: 2026-08-09T14:21:00+10:00",
      "---",
      "",
      "A literature note.",
      "",
    ].join("\n"),
    "reader-source",
    "dev.mdbase.reader.source",
    "title",
  ],
  [
    "views/example.md",
    "---\ntype: view\nid: reader.library.example\nversion: 1\nname: Example\nviews:\n  - id: all\n    name: All\n---\n",
    "view",
    "mdbase.view",
    "name",
  ],
]) {
  const result = await validateRecord({ resources: collection, path, source });
  if (result.issues.length > 0 || result.types.join() !== type) {
    fail(`A Reader ${type} record is not a valid ${contract} record: ${describe(result.issues)}`);
  }
  const implementation = implementations.get(contract);
  if (
    implementation.type !== type ||
    !implementation.fields.some(([from, to]) => from === field && to === field)
  ) {
    fail(`${contract} should read ${field} from Reader's ${type} records.`);
  }
}

function describe(issues) {
  return issues.map((issue) => issue.message).join("; ");
}

function digest(document) {
  return `sha256:${createHash("sha256").update(document).digest("hex")}`;
}

function fail(message) {
  throw new Error(message);
}
