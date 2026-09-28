import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyTypePack, assessTypePack } from "@callumalpass/mdbase";

import { buildReaderManifest } from "./reader-manifest.mjs";

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
const provision = (pack) => ({ manifest: pack.manifest, resources: pack.resources });

// Published identities must not change. Add a new version/digest instead of updating this pin.
const releasedDigests = {
  "1.0.0-beta.3": "sha256:712aa3d2ad5ca8719505b27c8c72f39fb9643660edbbeee3321e01ab53ef6938",
};

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
  assert.equal(current.manifest.version, "1.0.0-beta.3");
  assert.deepEqual(current.provides, legacy.provides);
  assert.equal(application.requirements.capabilities.contract_version, 2);
  const view = application.provisions.type_packs.find((pack) => pack.manifest.id === "mdbase.view");
  assert.equal(view.manifest.version, "1.0.0");
});

test("the released pack digest stays immutable and is independent of deployment origin", async (t) => {
  const root = await collection(t);
  const assessment = await assess(root, current);
  assert.equal(assessment.status, "install");
  assert.equal(
    assessment.desired.digest,
    releasedDigests[current.manifest.version],
    "Type-pack contents changed: publish a new pack version and add its digest; do not alter an existing release pin.",
  );
  const staging = await buildReaderManifest({ origin: "https://staging.mdbase-reader.pages.dev" });
  assert.deepEqual(staging.provisions.type_packs[0], current);
});

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
  test(`upgrades ${variant} to beta.3 preserving contracts, customized seed types and notes`, async (t) => {
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
    assert.equal(applied.receipt.version, "1.0.0-beta.3");
    await assertPreserved(contents);
    const again = await assess(root, current);
    assert.equal(again.status, "current");
    assert.equal(again.applicable, true);
    await apply(root, current, again);
    await assertPreserved(contents);
  });
}
