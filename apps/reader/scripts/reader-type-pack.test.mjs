import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Collection, V03Operations, applyTypePack, assessTypePack } from "@callumalpass/mdbase";
import { parse as parseYaml } from "yaml";

import { buildReaderManifest } from "./reader-manifest.mjs";

// Exact released pack from a4ebc04e8eab366e4ff265cbcd08f8dcd51830c3, before PR #20
// changed the starter type match rules without changing the immutable pack version.
const legacy = JSON.parse(
  await readFile(new URL("./fixtures/reader-pack-beta1.json", import.meta.url), "utf8"),
);
// Exact released pack from fde25820c64dfd44ee6c10842c2da8daac3733f8: its reader-source
// starter implemented source contract 1.0.0-beta.2, which 52eb850 reverted to beta.1.
const legacyBeta2 = JSON.parse(
  await readFile(new URL("./fixtures/reader-pack-beta2.json", import.meta.url), "utf8"),
);
// Exact beta.6 pack, the first with collection settings: dev.mdbase.reader.settings 1.0.0 and
// version 1 of the reader-settings starter.
const legacyBeta6 = JSON.parse(
  await readFile(new URL("./fixtures/reader-pack-beta6.json", import.meta.url), "utf8"),
);
const application = await buildReaderManifest();
const current = application.provisions.type_packs.find(
  (pack) => pack.manifest.id === "dev.mdbase.reader",
);
const viewPack = application.provisions.type_packs.find(
  (pack) => pack.manifest.id === "mdbase.view",
);
const options = { installedBy: application.id };
// What beta.6 added for collection settings, at beta.7's versions. Earlier packs, and rebuilds
// of them, lack all of it.
const settingsContracts = new Set(["mdbase.app-settings", "dev.mdbase.reader.settings"]);
const settingsSources = new Set([
  "schemas/mdbase.app-settings/1.0.0.schema.json",
  "contracts/mdbase.app-settings/1.0.0.md",
  "schemas/dev.mdbase.reader.settings/1.1.0.schema.json",
  "contracts/dev.mdbase.reader.settings/1.1.0.md",
  "types/reader-settings.md",
]);
const isSettings = ({ source }) => settingsSources.has(source);
const settingsSchema = "schemas/dev.mdbase.reader.settings/1.1.0.schema.json";
// beta.6's settings contract and schema, which beta.7 retires.
const retiredSettings = new Set([
  "schemas/dev.mdbase.reader.settings/1.0.0.schema.json",
  "contracts/dev.mdbase.reader.settings/1.0.0.md",
]);

function withoutSettings(pack) {
  const copy = structuredClone(pack);
  copy.provides = copy.provides.filter(({ id }) => !settingsContracts.has(id));
  copy.manifest.resources = copy.manifest.resources.filter((resource) => !isSettings(resource));
  copy.resources = copy.resources.filter((resource) => !isSettings(resource));
  return copy;
}
const provision = (pack) => ({ manifest: pack.manifest, resources: pack.resources });

// Published identities must not change. Add a new version/digest instead of updating this pin.
// Pins are the installer's desired pack digest, which covers `upgrade_from`; the beta.4 and
// beta.5 pins match the mdbase CLI's `packs assess`.
const releasedDigests = {
  "1.0.0-beta.3": "sha256:712aa3d2ad5ca8719505b27c8c72f39fb9643660edbbeee3321e01ab53ef6938",
  "1.0.0-beta.4": "sha256:f66f0b5e96df834c2aeab9aaddb4dc6eb6533111892a121ccb2b89ec15660dac",
  "1.0.0-beta.5": "sha256:a8c684491b91ad290a8bd63a3709a949ea58679c69fc600aabba2422da95055b",
  "1.0.0-beta.6": "sha256:82027c429b2e4c061f2e447f3af4004463c969633de2454653e8327a2bda2f54",
  "1.0.0-beta.7": "sha256:3962ae19ef014455a8b147dd6469e6d2e3c77cc9b61e9aabad5b0f54c0283b37",
};
// The vendored mdbase-contracts view pack, pinned the same way. 1.0.1 ships the version-2
// view starter (no pinned `type`, open top level) with `upgrade_from` the 1.0.0 starter;
// confirmed with the mdbase CLI's `packs assess`.
const releasedViewPackDigests = {
  "1.0.1": "sha256:b32222bce5f16b01b87c34736b0e70bfad3583b5678557fa6c42ee706f7ef1d4",
};
// Every distinct starter Reader shipped before version 2, by the first pack that shipped it,
// newest first: the order beta.5 lists them as `upgrade_from` baselines. beta.2 changed only
// reader-source, and the beta.3 starters were also served as beta.1 between #20 and #26.
const earlierStarters = {
  "types/reader-source.md": {
    "1.0.0-beta.3": "sha256:82869c12234662297cc273aab993732d35827b8a2ba8ad74bec18975cadf0c1a",
    "1.0.0-beta.2": "sha256:54f46e7c3bb70e1cea5a37afa458406a0acf2be7f195c8893160782d87254990",
    "1.0.0-beta.1": "sha256:e8a3fca643d335e684810c2e83bc9e9c3fc702ecf5a23d29283615902e0cfa55",
  },
  "types/reader-annotation.md": {
    "1.0.0-beta.3": "sha256:1fb7e758a4aacd139a30f15d7937ca18e95a6d6bec447a5b2cd8e6fb7907a901",
    "1.0.0-beta.1": "sha256:9b6b0fc7e1d883b9a56c743c3e5525eb80946c76cae34e9158fc574bb87a4cbe",
  },
};

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function frontmatter(document) {
  return parseYaml(/^---\n([\s\S]*?)\n---\n/u.exec(document)[1]);
}

function baseline(resource, version) {
  const digest = earlierStarters[resource.source][version];
  return resource.upgrade_from.find((candidate) => candidate.digest === digest);
}

// beta.3 as released: the current manifest with each seed's beta.3 baseline as its document.
function beta3() {
  const pack = withoutSettings(current);
  pack.manifest.version = "1.0.0-beta.3";
  for (const resource of pack.manifest.resources) {
    if (!resource.upgrade_from) continue;
    const { digest, document } = baseline(resource, "1.0.0-beta.3");
    resource.digest = digest;
    pack.resources.find(({ source }) => source === resource.source).document = document;
    delete resource.upgrade_from;
  }
  return pack;
}

// beta.4 as released: the current starters with the beta.3 starter as their single baseline.
function beta4() {
  const pack = withoutSettings(current);
  pack.manifest.version = "1.0.0-beta.4";
  for (const resource of pack.manifest.resources) {
    if (!resource.upgrade_from) continue;
    const { digest, document } = baseline(resource, "1.0.0-beta.3");
    resource.upgrade_from = { digest, document };
  }
  return pack;
}

const earlierPacks = {
  "1.0.0-beta.1": () => legacy,
  "1.0.0-beta.2": () => legacyBeta2,
  "1.0.0-beta.3": beta3,
};

// The starter a pack shipped for a seed, by its digest in that pack.
function starterVersion(source, digest) {
  return Object.entries(earlierStarters[source]).find(([, pinned]) => pinned === digest)?.[0];
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

test("Reader's new pack release preserves contract identities and capability protocol", async (t) => {
  assert.equal(current.manifest.version, "1.0.0-beta.7");
  assert.deepEqual(withoutSettings(current).provides, legacy.provides);
  assert.deepEqual(
    current.provides
      .filter(({ id }) => settingsContracts.has(id))
      .map(({ id, version }) => [id, version]),
    [
      ["mdbase.app-settings", "1.0.0"],
      ["dev.mdbase.reader.settings", "1.1.0"],
    ],
  );
  assert.equal(application.requirements.capabilities.contract_version, 2);
  assert.equal(viewPack.manifest.version, "1.0.1");
  assert.deepEqual(
    viewPack.provides.map(({ id, version }) => `${id}@${version}`),
    ["mdbase.view@1.0.0"],
  );
  const assessment = await assess(await collection(t), viewPack);
  assert.equal(assessment.status, "install");
  assert.equal(assessment.desired.digest, releasedViewPackDigests[viewPack.manifest.version]);
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

test("seed upgrades list every earlier starter type, newest first, as exact bytes", async (t) => {
  const seeds = current.manifest.resources.filter(
    (resource) => resource.mode === "seed" && !isSettings(resource),
  );
  assert.deepEqual(seeds.map((seed) => seed.source).sort(), Object.keys(earlierStarters).sort());
  // The settings starter, new in beta.6, upgrades from beta.6's version 1.
  const settingsSeed = current.manifest.resources.find(
    (resource) => resource.mode === "seed" && isSettings(resource),
  );
  const beta6Settings = legacyBeta6.manifest.resources.find(
    ({ source }) => source === settingsSeed.source,
  );
  assert.deepEqual(
    settingsSeed.upgrade_from.map(({ digest, version }) => ({ digest, version })),
    [{ digest: beta6Settings.digest, version: 1 }],
  );
  const desired = new Map(current.resources.map(({ source, document }) => [source, document]));
  for (const seed of seeds) {
    assert.equal(seed.kind, "type");
    assert.ok(Array.isArray(seed.upgrade_from), seed.source);
    assert.deepEqual(
      seed.upgrade_from.map(({ digest }) => digest),
      Object.values(earlierStarters[seed.source]),
    );
    const type = frontmatter(desired.get(seed.source));
    for (const { digest, document, version } of seed.upgrade_from) {
      assert.equal(sha256(document), digest);
      assert.notEqual(digest, seed.digest);
      const starter = frontmatter(document);
      assert.equal(starter.kind, type.kind);
      assert.equal(starter.name, type.name);
      assert.equal(version, starter.version);
      assert.equal(version, 1);
    }
  }
  for (const resource of current.manifest.resources.filter(({ mode }) => mode !== "seed")) {
    assert.equal(resource.upgrade_from, undefined);
  }
  // The beta.6 fixture is the released pack, and its starter is the baseline byte for byte.
  assert.equal(
    (await assess(await collection(t), legacyBeta6)).desired.digest,
    releasedDigests["1.0.0-beta.6"],
  );
  assert.equal(
    settingsSeed.upgrade_from[0].document,
    legacyBeta6.resources.find(({ source }) => source === settingsSeed.source).document,
  );
  // The released beta.1 and beta.2 packs shipped exactly these baselines.
  for (const [version, pack] of Object.entries(earlierPacks)) {
    const documents = new Map(pack().resources.map(({ source, document }) => [source, document]));
    for (const resource of pack().manifest.resources.filter(({ mode }) => mode === "seed")) {
      const starter = baseline(
        current.manifest.resources.find(({ source }) => source === resource.source),
        starterVersion(resource.source, resource.digest),
      );
      assert.equal(
        starter?.document,
        documents.get(resource.source),
        `${version} ${resource.source}`,
      );
    }
  }
  // Rebuilding beta.3 and beta.4 from the baselines reproduces their released identities.
  for (const [version, pack] of [
    ["1.0.0-beta.3", beta3()],
    ["1.0.0-beta.4", beta4()],
  ]) {
    const assessment = await assess(await collection(t), pack);
    assert.equal(assessment.desired.digest, releasedDigests[version], version);
  }
});

for (const [version, pack] of Object.entries(earlierPacks)) {
  test(`replaces unedited ${version} starters with the exact version-2 seeds`, async (t) => {
    const root = await collection(t);
    const installed = pack();
    await apply(root, installed, await assess(root, installed));
    const upgrade = await assess(root, current);
    assert.equal(upgrade.status, "upgrade");
    assert.equal(upgrade.applicable, true);
    const installedDigests = new Map(
      installed.manifest.resources.map(({ source, digest }) => [source, digest]),
    );
    for (const resource of upgrade.resources.filter(isSettings)) {
      assert.equal(resource.action, "create", resource.source);
    }
    for (const resource of upgrade.resources.filter(
      (resource) => resource.mode === "seed" && !isSettings(resource),
    )) {
      assert.equal(resource.action, "update", resource.source);
      // Each seed is replaced from the starter its pack shipped, which may predate the pack.
      const starter = installedDigests.get(resource.source);
      assert.ok(starterVersion(resource.source, starter), resource.source);
      assert.deepEqual(resource.upgrade_baseline, { digest: starter, version: 1 });
    }
    await apply(root, current, upgrade);
    for (const resource of current.resources.filter(({ source }) => source.startsWith("types/"))) {
      const target = current.manifest.resources.find(({ source }) => source === resource.source);
      assert.equal(await readFile(join(root, target.target), "utf8"), resource.document);
    }
    assert.equal((await assess(root, current)).status, "current");
  });
}

// beta.1's starters had top-level `match` rules that later starters removed. A seed edited
// since beta.1 is merged against beta.1, so that removal is the publisher's: 05A requires a
// top-level removal to be reviewed by hand, so the upgrade fails closed instead of merging
// against beta.3 and silently restoring the rule as if it were the collection's edit.
test("fails closed on an edited beta.1 starter instead of restoring its match rule", async (t) => {
  const root = await collection(t);
  await apply(root, legacy, await assess(root, legacy));
  const sourceType = join(root, "_types", "reader-source.md");
  const original = await readFile(sourceType, "utf8");
  assert.equal(frontmatter(original).match.path_glob, "sources/**/*.md");
  const edited = original.replace("\ndescription: ", "\ndescription: Collection edit. ");
  await writeFile(sourceType, edited);
  const upgrade = await assess(root, current);
  assert.equal(upgrade.status, "conflict");
  assert.equal(upgrade.applicable, false);
  const seeds = new Map(upgrade.resources.map((resource) => [resource.source, resource]));
  assert.equal(seeds.get("types/reader-source.md").action, "conflict");
  assert.match(seeds.get("types/reader-source.md").reason, /top-level type setting/u);
  // The unedited annotation starter is still replaced from its own beta.1 baseline.
  assert.equal(seeds.get("types/reader-annotation.md").action, "update");
  assert.deepEqual(seeds.get("types/reader-annotation.md").upgrade_baseline, {
    digest: earlierStarters["types/reader-annotation.md"]["1.0.0-beta.1"],
    version: 1,
  });
  assert.equal(await readFile(sourceType, "utf8"), edited);
});

test("merges an edited beta.1 starter against the beta.1 baseline", async (t) => {
  const root = await collection(t);
  await apply(root, legacy, await assess(root, legacy));
  const sourceType = join(root, "_types", "reader-source.md");
  // The collection edited its description and, like every later starter, dropped `match`.
  const edited = (await readFile(sourceType, "utf8"))
    .replace("\ndescription: ", "\ndescription: Collection edit. ")
    .replace(/\nmatch:\n(?: {2}.*\n)+/u, "\n");
  assert.equal(Object.hasOwn(frontmatter(edited), "match"), false);
  await writeFile(sourceType, edited);
  const upgrade = await assess(root, current);
  assert.equal(upgrade.applicable, true);
  const seed = upgrade.resources.find(({ source }) => source === "types/reader-source.md");
  assert.equal(seed.action, "update");
  assert.deepEqual(seed.upgrade_baseline, {
    digest: earlierStarters["types/reader-source.md"]["1.0.0-beta.1"],
    version: 1,
  });
  await apply(root, current, upgrade);
  const type = frontmatter(await readFile(sourceType, "utf8"));
  assert.equal(type.version, 2);
  assert.match(type.description, /^Collection edit\. /u);
  assert.equal(Object.hasOwn(type, "match"), false);
  assert.equal(Object.hasOwn(type.schema.value.properties, "type"), false);
  assert.equal(type.schema.value.required.includes("type"), false);
  assert.equal((await assess(root, current)).status, "current");
});

test("keeps an edited seed whose lock predates recorded origins instead of guessing a baseline", async (t) => {
  const root = await collection(t);
  await apply(root, legacy, await assess(root, legacy));
  const lockPath = join(root, "mdbase.lock.yaml");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  // Locks written before mdbase-spec 05A recorded seed origins have no origin_digest.
  for (const resource of lock.packs[0].resources) {
    if (resource.mode !== "seed") continue;
    assert.ok(resource.origin_digest, resource.source);
    delete resource.origin_digest;
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  const sourceType = join(root, "_types", "reader-source.md");
  const edited = `${await readFile(sourceType, "utf8")}\nCollection note.\n`;
  await writeFile(sourceType, edited);
  const upgrade = await assess(root, current);
  assert.equal(upgrade.applicable, true);
  const seeds = new Map(upgrade.resources.map((resource) => [resource.source, resource]));
  assert.equal(seeds.get("types/reader-source.md").action, "preserve");
  assert.ok(seeds.get("types/reader-source.md").reason);
  // Unedited bytes still prove their origin.
  assert.equal(seeds.get("types/reader-annotation.md").action, "update");
  await apply(root, current, upgrade);
  assert.equal(await readFile(sourceType, "utf8"), edited);
});

for (const edited of [false, true]) {
  test(`upgrades ${edited ? "an edited" : "an unedited"} beta.3 starter to the version-2 seed`, async (t) => {
    const root = await collection(t);
    const installed = beta3();
    await apply(root, installed, await assess(root, installed));
    const sourceType = join(root, "_types", "reader-source.md");
    if (edited) {
      const document = await readFile(sourceType, "utf8");
      await writeFile(
        sourceType,
        document.replace("\ndescription: ", "\ndescription: Collection edit. "),
      );
    }
    const upgrade = await assess(root, current);
    assert.equal(upgrade.status, "upgrade");
    assert.equal(upgrade.applicable, true);
    for (const resource of upgrade.resources) {
      if (isSettings(resource)) {
        assert.equal(resource.action, "create", resource.source);
        continue;
      }
      assert.equal(resource.action, resource.mode === "seed" ? "update" : "unchanged");
      if (resource.mode === "seed") {
        assert.deepEqual(resource.upgrade_baseline, {
          digest: earlierStarters[resource.source]["1.0.0-beta.3"],
          version: 1,
        });
      }
    }
    const applied = await apply(root, current, upgrade);
    assert.equal(applied.receipt.version, current.manifest.version);
    const desired = new Map(current.resources.map(({ source, document }) => [source, document]));
    for (const resource of current.manifest.resources.filter(({ mode }) => mode === "seed")) {
      const document = await readFile(join(root, resource.target), "utf8");
      if (edited && resource.source === "types/reader-source.md") {
        // Three-way merge: the collection's edit survives alongside version 2's changes.
        const type = frontmatter(document);
        assert.equal(type.version, 2);
        assert.match(type.description, /^Collection edit\. /u);
        assert.equal(Object.hasOwn(type.schema.value.properties, "type"), false);
        assert.equal(type.schema.value.required.includes("type"), false);
      } else {
        assert.equal(document, desired.get(resource.source), resource.source);
      }
    }
    assert.equal((await assess(root, current)).status, "current");
  });
}

test("starter types neither declare nor require the type key", () => {
  // A collection records a record's type under its own settings.explicit_type_keys, which
  // need not be `type` (some use [mdbase_type] because `type` holds CSL data).
  const documents = new Map(current.resources.map(({ source, document }) => [source, document]));
  for (const resource of current.manifest.resources.filter(({ kind }) => kind === "type")) {
    const type = frontmatter(documents.get(resource.source));
    const schema = isSettings(resource)
      ? JSON.parse(documents.get(settingsSchema))
      : type.schema.value;
    assert.equal(type.version, 2, resource.source);
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
            // Reader links sources by path (see sourceLink); IDs resolve only with id_field.
            source: "[[sources/example|Example source]]",
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

  test(`view records created by type name are valid where explicit_type_keys is ${typeKeys}`, async (t) => {
    // mdbase.view 1.0.1's version-2 starter keeps `match: { where: { type: view } }` for
    // hand-written records; a create that names the type is explicit membership regardless.
    const root = await collection(t);
    await apply(root, viewPack, await assess(root, viewPack));
    await writeFile(
      join(root, "mdbase.yaml"),
      `spec_version: 0.3.0\nsettings:\n  explicit_type_keys: ${typeKeys}\n`,
    );
    const opened = await Collection.open(root);
    assert.ok(opened.collection, opened.error?.message);
    try {
      const created = await new V03Operations(opened.collection).create({
        path: "views/example.md",
        type: "view",
        frontmatter: {
          id: "reader.library.example",
          version: 1,
          name: "Example",
          // In a [mdbase_type] collection `type` is ordinary data the open top level accepts.
          ...(typeKeys === "[mdbase_type]" ? { type: "article-journal" } : {}),
          views: [{ id: "all", name: "All" }],
        },
      });
      assert.equal(created.valid, true, JSON.stringify(created.diagnostics));
      const written = frontmatter(await readFile(join(root, "views", "example.md"), "utf8"));
      assert.equal(written[typeKeys.slice(1, -1)], "view");
      if (typeKeys === "[mdbase_type]") assert.equal(written.type, "article-journal");
      const validation = await opened.collection.validate("views/example.md");
      assert.equal(validation.valid, true, JSON.stringify(validation.issues));
      const view = await opened.collection.getContractView(
        "views/example.md",
        "mdbase.view",
        "1.0.0",
      );
      assert.equal(view.valid, true);
      assert.equal(view.view.name, "Example");
    } finally {
      await opened.collection.close();
    }
  });
}

for (const typeKeys of ["[type]", "[mdbase_type]"]) {
  test(`the settings record validates against the managed schema where explicit_type_keys is ${typeKeys}`, async (t) => {
    const root = await collection(t);
    await apply(root, current, await assess(root, current));
    await writeFile(
      join(root, "mdbase.yaml"),
      `spec_version: 0.3.0\nsettings:\n  explicit_type_keys: ${typeKeys}\n`,
    );
    const opened = await Collection.open(root);
    assert.ok(opened.collection, opened.error?.message);
    const operations = new V03Operations(opened.collection);
    const settings = {
      app: "dev.mdbase.reader",
      scope: "collection",
      settings_version: 1,
      source_name_template: "{{ year }}/{{ title | slug }}",
      highlight_colors: ["pink", "yellow"],
      highlight_meanings: { pink: "Question" },
    };
    try {
      const created = await operations.create({
        path: "_settings/dev.mdbase.reader.md",
        type: "reader-settings",
        frontmatter: settings,
      });
      assert.equal(created.valid, true, JSON.stringify(created.diagnostics));
      for (const [contract, version, fields] of [
        ["mdbase.app-settings", "1.0.0", ["app", "scope", "settings_version"]],
        [
          "dev.mdbase.reader.settings",
          "1.1.0",
          ["app", "source_name_template", "highlight_colors", "highlight_meanings"],
        ],
      ]) {
        const view = await opened.collection.getContractView(
          "_settings/dev.mdbase.reader.md",
          contract,
          version,
        );
        assert.equal(view.valid, true, contract);
        for (const field of fields) assert.deepEqual(view.view[field], settings[field], field);
      }
      for (const [path, frontmatter, code] of [
        [
          "_settings/empty-template.md",
          { ...settings, source_name_template: "" },
          "schema_min_length",
        ],
        ["_settings/other-app.md", { ...settings, app: "tasknotes" }, "schema_const"],
        ["_settings/no-colours.md", { ...settings, highlight_colors: [] }, "schema_min_items"],
        [
          "_settings/twice.md",
          { ...settings, highlight_colors: ["pink", "pink"] },
          "schema_unique_items",
        ],
        ["_settings/orange.md", { ...settings, highlight_colors: ["orange"] }, "schema_enum"],
        [
          "_settings/long-meaning.md",
          { ...settings, highlight_meanings: { pink: "x".repeat(41) } },
          "schema_max_length",
        ],
        // One collection-scope record per app.
        ["_settings/second.md", settings, "duplicate_value"],
      ]) {
        const refused = await operations.create({ path, type: "reader-settings", frontmatter });
        assert.equal(refused.valid, false, path);
        assert.ok(
          refused.diagnostics.some((diagnostic) => diagnostic.code === code),
          JSON.stringify(refused.diagnostics),
        );
      }
    } finally {
      await opened.collection.close();
    }
  });
}

for (const edited of [false, true]) {
  test(`upgrades beta.6's settings to contract 1.1.0 with ${edited ? "an edited" : "an unedited"} starter`, async (t) => {
    const root = await collection(t);
    await apply(root, legacyBeta6, await assess(root, legacyBeta6));
    // A record written by beta.6 Reader stays a valid 1.1.0 record.
    await mkdir(join(root, "_settings"));
    const recordPath = join(root, "_settings", "dev.mdbase.reader.md");
    const record =
      '---\ntype: reader-settings\napp: dev.mdbase.reader\nscope: collection\nsettings_version: 1\nannotation_name_template: "{{ date }}-{{ short_id }}"\n---\n';
    await writeFile(recordPath, record);
    const settingsType = join(root, "_types", "reader-settings.md");
    if (edited) {
      const document = await readFile(settingsType, "utf8");
      await writeFile(settingsType, `${document}\nCollection note.\n`);
    }
    const upgrade = await assess(root, current);
    assert.equal(upgrade.status, "upgrade");
    assert.equal(upgrade.applicable, true);
    const actions = Object.fromEntries(
      upgrade.resources.map(({ source, action }) => [source, action]),
    );
    assert.deepEqual(actions, {
      "contracts/dev.mdbase.reader.source.md": "unchanged",
      "contracts/dev.mdbase.reader.annotation.md": "unchanged",
      "types/reader-source.md": "preserve",
      "types/reader-annotation.md": "preserve",
      "schemas/mdbase.app-settings/1.0.0.schema.json": "unchanged",
      "contracts/mdbase.app-settings/1.0.0.md": "unchanged",
      "schemas/dev.mdbase.reader.settings/1.1.0.schema.json": "create",
      "contracts/dev.mdbase.reader.settings/1.1.0.md": "create",
      "types/reader-settings.md": "update",
      "schemas/dev.mdbase.reader.settings/1.0.0.schema.json": "delete",
      "contracts/dev.mdbase.reader.settings/1.0.0.md": "delete",
    });
    const seed = upgrade.resources.find(({ source }) => source === "types/reader-settings.md");
    assert.deepEqual(seed.upgrade_baseline, {
      digest: legacyBeta6.manifest.resources.find(({ source }) => source === seed.source).digest,
      version: 1,
    });
    await apply(root, current, upgrade);
    for (const source of retiredSettings) {
      const target = legacyBeta6.manifest.resources.find((resource) => resource.source === source);
      await assert.rejects(readFile(join(root, target.target), "utf8"), { code: "ENOENT" });
    }
    const type = await readFile(settingsType, "utf8");
    if (edited) {
      // Three-way merge: the collection's note survives alongside version 2's changes.
      assert.equal(frontmatter(type).version, 2);
      assert.equal(
        frontmatter(type).schema.ref,
        "../schemas/dev.mdbase.reader.settings/1.1.0.schema.json",
      );
      assert.match(type, /Collection note\./u);
    } else {
      assert.equal(type, current.resources.find(({ source }) => source === seed.source).document);
    }
    assert.equal(await readFile(recordPath, "utf8"), record);
    assert.equal((await assess(root, current)).status, "current");
    const opened = await Collection.open(root);
    assert.ok(opened.collection, opened.error?.message);
    try {
      const validation = await opened.collection.validate("_settings/dev.mdbase.reader.md");
      assert.equal(validation.valid, true, JSON.stringify(validation.issues));
      const view = await opened.collection.getContractView(
        "_settings/dev.mdbase.reader.md",
        "dev.mdbase.reader.settings",
        "1.1.0",
      );
      assert.equal(view.valid, true);
      assert.equal(view.view.annotation_name_template, "{{ date }}-{{ short_id }}");
    } finally {
      await opened.collection.close();
    }
  });
}

test("reproduces the immutable beta.1 digest conflict without touching installed files", async (t) => {
  const root = await collection(t);
  await apply(root, legacy, await assess(root, legacy));
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
  const contents = await preserveExamples(root, legacy);
  const edited = await assess(root, reusedVersion);
  assert.equal(edited.status, "conflict");
  assert.equal(edited.applicable, false);
  await assertPreserved(contents);
});

// original-beta.1's seeds are version-1 starters the collection edited. They are merged
// against the beta.1 starters they were installed from (not beta.3's, which would restore
// beta.1's removed `match` rules as if they were collection edits), and that removal needs
// manual review, so the upgrade fails closed and touches nothing.
// changed-beta.1 already shipped the version-2 starters, so the edited seeds are kept as is.
for (const variant of ["original-beta.1", "changed-beta.1"]) {
  test(`upgrades ${variant} to the current pack preserving contracts, customized seed types and notes`, async (t) => {
    const root = await collection(t);
    const original = variant === "original-beta.1";
    const installed = original ? structuredClone(legacy) : withoutSettings(current);
    installed.manifest.version = "1.0.0-beta.1";
    await apply(root, installed, await assess(root, installed));
    const contents = await preserveExamples(root, installed);
    const upgrade = await assess(root, current);
    if (original) {
      assert.equal(upgrade.status, "conflict");
      assert.equal(upgrade.applicable, false);
      for (const resource of upgrade.resources.filter((resource) => !isSettings(resource))) {
        assert.equal(resource.action, resource.mode === "seed" ? "conflict" : "unchanged");
        if (resource.mode === "seed") assert.match(resource.reason, /top-level type setting/u);
      }
      await assertPreserved(contents);
      return;
    }
    assert.equal(upgrade.status, "upgrade");
    assert.equal(upgrade.applicable, true);
    for (const resource of upgrade.resources) {
      const expected = resource.mode === "seed" ? "preserve" : "unchanged";
      assert.equal(resource.action, isSettings(resource) ? "create" : expected, resource.source);
    }
    const applied = await apply(root, current, upgrade);
    assert.equal(applied.receipt.version, current.manifest.version);
    await assertPreserved(contents);
    const again = await assess(root, current);
    assert.equal(again.status, "current");
    assert.equal(again.applicable, true);
    await apply(root, current, again);
    await assertPreserved(contents);
  });
}
