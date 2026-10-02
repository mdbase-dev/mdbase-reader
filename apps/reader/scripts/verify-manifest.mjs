import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Collection, applyTypePack, assessTypePack } from "@callumalpass/mdbase";
import { formatValidationIssues, validateAppManifest } from "@mdbase-dev/connect-dev";

import { referenceInstallerProvision } from "./reader-manifest.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(projectRoot, "public", ".well-known", "mdbase-app.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const validation = validateAppManifest(manifest);
if (!validation.valid) {
  fail(`Reader manifest is invalid: ${formatValidationIssues(validation.issues)}`);
}
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

const collectionRoot = await mkdtemp(join(tmpdir(), "mdbase-reader-pack-"));
try {
  await writeFile(join(collectionRoot, "mdbase.yaml"), "spec_version: 0.3.0\n");
  for (const pack of packs) {
    const provision = referenceInstallerProvision(pack);
    const assessment = await assessTypePack(collectionRoot, provision, {
      installedBy: manifest.id,
    });
    assertValid(assessment, "assessment");
    const installed = await applyTypePack(collectionRoot, provision, {
      installedBy: manifest.id,
      expectedAssessmentDigest: assessment.result.assessment_digest,
    });
    assertValid(installed, "installation");
  }

  await mkdir(join(collectionRoot, "views"));
  await writeFile(
    join(collectionRoot, "views", "example.md"),
    "---\ntype: view\nid: reader.library.example\nversion: 1\nname: Example\nviews:\n  - id: all\n    name: All\n---\n",
  );
  await mkdir(join(collectionRoot, "sources"));
  await writeFile(
    join(collectionRoot, "sources", "example.md"),
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
  );
  const opened = await Collection.open(collectionRoot);
  if (!opened.collection || opened.error) {
    fail(`Installed collection did not open: ${opened.error?.message ?? "unknown error"}`);
  }
  try {
    for (const requirement of manifest.requirements.contracts) {
      const implementations = opened.collection.getDataContractImplementations(
        requirement.id,
        requirement.version,
      );
      if (implementations.length !== 1) {
        fail(`${requirement.id} should have exactly one starter implementation.`);
      }
    }
    const source = await opened.collection.getContractView(
      "sources/example.md",
      "dev.mdbase.reader.source",
      "1.0.0-beta.1",
    );
    if (!source.valid || source.view.title !== "Example source") {
      fail("Reader source contract did not project a valid source view.");
    }
    const view = await opened.collection.getContractView(
      "views/example.md",
      "mdbase.view",
      "1.0.0",
    );
    if (!view.valid || view.view.name !== "Example") {
      fail("A Reader view record did not project a valid mdbase.view contract view.");
    }
  } finally {
    await opened.collection.close();
  }
} finally {
  await rm(collectionRoot, { recursive: true, force: true });
}

function digest(document) {
  return `sha256:${createHash("sha256").update(document).digest("hex")}`;
}

function assertValid(result, operation) {
  if (!result.valid) {
    fail(
      `Reader type-pack ${operation} failed: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
}

function fail(message) {
  throw new Error(message);
}
