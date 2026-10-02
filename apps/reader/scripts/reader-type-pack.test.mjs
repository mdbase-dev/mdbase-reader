import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Collection, V03Operations, applyTypePack, assessTypePack } from "@callumalpass/mdbase";
import { parse as parseYaml } from "yaml";

import { buildReaderManifest, referenceInstallerProvision } from "./reader-manifest.mjs";

// Exact released pack from a4ebc04e8eab366e4ff265cbcd08f8dcd51830c3, before PR #20
// changed the starter type match rules without changing the immutable pack version.
const legacy = JSON.parse(
  await readFile(new URL("./fixtures/reader-pack-beta1.json", import.meta.url), "utf8"),
);
const application = await buildReaderManifest();
const current = application.provisions.type_packs.find(
  (pack) => pack.manifest.id === "dev.mdbase.reader",
);
const options = { installedBy: application.id };
// The JavaScript installer predates `upgrade_from`; see referenceInstallerProvision.
const provision = referenceInstallerProvision;

// Published identities must not change. Add a new version/digest instead of updating this pin.
// Pack digests are SHA-256 over the canonical (sorted-key) JSON of the whole pack manifest,
// `upgrade_from` included; beta.4's pin was confirmed with the mdbase CLI's `packs assess`.
const releasedDigests = {
  "1.0.0-beta.3": "sha256:712aa3d2ad5ca8719505b27c8c72f39fb9643660edbbeee3321e01ab53ef6938",
  "1.0.0-beta.4": "sha256:f66f0b5e96df834c2aeab9aaddb4dc6eb6533111892a121ccb2b89ec15660dac",
};
// Exact bytes of the version-1 starter types released in beta.3, which beta.4 upgrades from.
const beta3SeedDigests = {
  "types/reader-source.md":
    "sha256:82869c12234662297cc273aab993732d35827b8a2ba8ad74bec18975cadf0c1a",
  "types/reader-annotation.md":
    "sha256:1fb7e758a4aacd139a30f15d7937ca18e95a6d6bec447a5b2cd8e6fb7907a901",
};

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function frontmatter(document) {
  return parseYaml(/^---\n([\s\S]*?)\n---\n/u.exec(document)[1]);
}

async function collection(t) {
  const root = await mkdtemp(join(tmpdir(), "reader-pack-upgrade-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "mdbase.yaml"), "spec_version: 0.3.0\n");
  return root;
}

async function assess(root, pack) {
  const result = await assessTypePack(root, provision(pack), options);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  return result.result;
}

async function apply(root, pack, assessment) {
  assert.equal(assessment.applicable, true);
  const result = await applyTypePack(root, provision(pack), {
    ...options,
    expectedAssessmentDigest: assessment.assessment_digest,
  });
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  return result.result;
}

async function preserveExamples(root, pack) {
  const contents = new Map();
  for (const resource of pack.manifest.resources) {
    const path = join(root, resource.target);
    let document = await readFile(path, "utf8");
    if (resource.mode === "seed") {
      document += "\nCollection-owned customisation: keep this exact type document.\n";
      await writeFile(path, document);
    }
    contents.set(path, document);
  }
  await mkdir(join(root, "sources"));
  const path = join(root, "sources", "existing.md");
  const document =
    "---\ntype: reader-source\nid: existing-source\ntitle: Existing source\nkind: document\nsaved_at: 2026-08-09T14:21:00+10:00\n---\n\nKeep my literature note.\n";
  await writeFile(path, document);
  contents.set(path, document);
  return contents;
}

async function assertPreserved(contents) {
  for (const [path, document] of contents) assert.equal(await readFile(path, "utf8"), document);
}

test("Reader's new pack release preserves contract identities and capability protocol", () => {
  assert.equal(current.manifest.version, "1.0.0-beta.4");
  assert.deepEqual(current.provides, legacy.provides);
  assert.equal(application.requirements.capabilities.contract_version, 2);
  const view = application.provisions.type_packs.find((pack) => pack.manifest.id === "mdbase.view");
  assert.equal(view.manifest.version, "1.0.0");
});

test("the released pack digest stays immutable and is independent of deployment origin", async (t) => {
  assert.equal(
    sha256(canonicalJson(current.manifest)),
    releasedDigests[current.manifest.version],
    "Type-pack contents changed: publish a new pack version and add its digest; do not alter an existing release pin.",
  );
  const root = await collection(t);
  assert.equal((await assess(root, current)).status, "install");
  const staging = await buildReaderManifest({ origin: "https://staging.mdbase-reader.pages.dev" });
  assert.deepEqual(staging.provisions.type_packs[0], current);
});

test("seed upgrades start from the exact beta.3 starter types", () => {
  const seeds = current.manifest.resources.filter((resource) => resource.mode === "seed");
  assert.deepEqual(seeds.map((seed) => seed.source).sort(), Object.keys(beta3SeedDigests).sort());
  for (const seed of seeds) {
    assert.equal(seed.kind, "type");
    assert.equal(seed.upgrade_from.digest, beta3SeedDigests[seed.source]);
    assert.equal(sha256(seed.upgrade_from.document), seed.upgrade_from.digest);
    assert.equal(frontmatter(seed.upgrade_from.document).version, 1);
  }
  for (const resource of current.manifest.resources.filter(({ mode }) => mode !== "seed")) {
    assert.equal(resource.upgrade_from, undefined);
  }
  // Rebuilding beta.3 from the baselines reproduces its released pack identity exactly.
  const beta3 = structuredClone(current.manifest);
  beta3.version = "1.0.0-beta.3";
  for (const resource of beta3.resources) {
    if (resource.upgrade_from) resource.digest = resource.upgrade_from.digest;
    delete resource.upgrade_from;
  }
  assert.equal(sha256(canonicalJson(beta3)), releasedDigests["1.0.0-beta.3"]);
});

test("starter types neither declare nor require the type key", () => {
  // A collection records a record's type under its own settings.explicit_type_keys, which
  // need not be `type` (some use [mdbase_type] because `type` holds CSL data).
  const documents = new Map(current.resources.map(({ source, document }) => [source, document]));
  for (const resource of current.manifest.resources.filter(({ kind }) => kind === "type")) {
    const type = frontmatter(documents.get(resource.source));
    assert.equal(type.version, 2, resource.source);
    const schema = type.schema.value;
    assert.equal(schema.additionalProperties, true, resource.source);
    for (const key of ["type", "types"]) {
      assert.equal(
        Object.hasOwn(schema.properties, key),
        false,
        `${resource.source} declares ${key}`,
      );
      assert.equal(schema.required.includes(key), false, `${resource.source} requires ${key}`);
    }
  }
});

for (const typeKeys of ["[type]", "[mdbase_type]"]) {
  test(`records created by type name are valid where explicit_type_keys is ${typeKeys}`, async (t) => {
    const root = await collection(t);
    await apply(root, current, await assess(root, current));
    await writeFile(
      join(root, "mdbase.yaml"),
      `spec_version: 0.3.0\nsettings:\n  explicit_type_keys: ${typeKeys}\n`,
    );
    const opened = await Collection.open(root);
    assert.ok(opened.collection, opened.error?.message);
    const operations = new V03Operations(opened.collection);
    const created = [];
    try {
      created.push(
        await operations.create({
          path: "sources/example.md",
          type: "reader-source",
          frontmatter: {
            id: "src_example",
            title: "Example source",
            kind: "document",
            saved_at: "2026-08-09T14:21:00+10:00",
            // In a [mdbase_type] collection `type` is ordinary data, such as a CSL type.
            ...(typeKeys === "[mdbase_type]" ? { type: "article-journal" } : {}),
          },
        }),
      );
      created.push(
        await operations.create({
          path: "annotations/example.md",
          type: "reader-annotation",
          frontmatter: {
            id: "ann_example",
            source: "[[src_example]]",
            annotation_type: "highlight",
            created_at: "2026-08-09T14:22:00+10:00",
          },
        }),
      );
    } finally {
      await opened.collection.close();
    }
    for (const result of created)
      assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  });
}

test("reproduces the immutable beta.1 digest conflict without touching installed files", async (t) => {
  const root = await collection(t);
  await apply(root, legacy, await assess(root, legacy));
  const contents = await preserveExamples(root, legacy);
  const reusedVersion = structuredClone(current);
  reusedVersion.manifest.version = legacy.manifest.version;
  const conflict = await assess(root, reusedVersion);
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.applicable, false);
  assert.ok(
    conflict.resources.some((resource) =>
      resource.reason?.includes("different immutable pack digest"),
    ),
  );
  await assertPreserved(contents);
});

for (const variant of ["original-beta.1", "changed-beta.1"]) {
  test(`upgrades ${variant} to beta.4 preserving contracts, customized seed types and notes`, async (t) => {
    const root = await collection(t);
    const installed = structuredClone(variant === "original-beta.1" ? legacy : current);
    installed.manifest.version = "1.0.0-beta.1";
    await apply(root, installed, await assess(root, installed));
    const contents = await preserveExamples(root, installed);
    const upgrade = await assess(root, current);
    assert.equal(upgrade.status, "upgrade");
    assert.equal(upgrade.applicable, true);
    for (const resource of upgrade.resources) {
      assert.equal(resource.action, resource.mode === "seed" ? "preserve" : "unchanged");
    }
    const applied = await apply(root, current, upgrade);
    assert.equal(applied.receipt.version, "1.0.0-beta.4");
    await assertPreserved(contents);
    const again = await assess(root, current);
    assert.equal(again.status, "current");
    assert.equal(again.applicable, true);
    await apply(root, current, again);
    await assertPreserved(contents);
  });
}
