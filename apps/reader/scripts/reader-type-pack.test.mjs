import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyTypePack,
  assessTypePack,
  loadCatalog,
  parseLock,
  validateRecord,
} from "@mdbase-dev/mdbase";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

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
const legacyBeta7 = JSON.parse(
  await readFile(new URL("./fixtures/reader-pack-beta7.json", import.meta.url), "utf8"),
);
// Exact beta.8 pack, the last whose annotation contract and starter require `document.file_id`.
const legacyBeta8 = JSON.parse(
  await readFile(new URL("./fixtures/reader-pack-beta8.json", import.meta.url), "utf8"),
);
const application = await buildReaderManifest();
const current = application.provisions.type_packs.find(
  (pack) => pack.manifest.id === "dev.mdbase.reader",
);
const viewPack = application.provisions.type_packs.find(
  (pack) => pack.manifest.id === "mdbase.view",
);
const options = { installed_by: application.id };
// What beta.6 added for collection settings, at beta.7's versions. Earlier packs, and rebuilds
// of them, lack all of it.
const settingsContracts = new Set(["mdbase.app-settings", "dev.mdbase.reader.settings"]);
const settingsSources = new Set([
  "schemas/mdbase.app-settings/1.0.0.schema.json",
  "contracts/mdbase.app-settings/1.0.0.md",
  "schemas/dev.mdbase.reader.settings/1.1.0.schema.json",
  "contracts/dev.mdbase.reader.settings/1.1.0.md",
  "contracts/mdbase.app-settings/2.0.0.md",
  "contracts/dev.mdbase.reader.settings/1.2.0.md",
  "types/reader-settings.md",
]);
const isSettings = ({ source }) => settingsSources.has(source);
// What beta.9 added: the annotation contract whose document needs no Connect file ID.
const annotationContract = "contracts/dev.mdbase.reader.annotation/1.0.0-beta.2.md";
const annotationStarter = "types/reader-annotation.md";
// Resources an upgrade from a pack before beta.6 creates.
const isNew = (resource) => isSettings(resource) || resource.source === annotationContract;
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
// The engine takes a pack as its manifest text and its sources by pack-relative path.
const packInput = (pack) => ({
  manifest: JSON.stringify(pack.manifest),
  sources: Object.fromEntries(pack.resources.map(({ source, document }) => [source, document])),
});

// A pack as it was before beta.9: no annotation contract 1.0.0-beta.2, and the version-2
// annotation starter that beta.4 to beta.8 shipped.
function beforeBeta9(pack) {
  const copy = structuredClone(pack);
  copy.manifest.resources = copy.manifest.resources.filter(
    ({ source }) => source !== annotationContract,
  );
  copy.resources = copy.resources.filter(({ source }) => source !== annotationContract);
  const seed = copy.manifest.resources.find(({ source }) => source === annotationStarter);
  const [starter, ...earlier] = seed.upgrade_from;
  seed.digest = starter.digest;
  seed.upgrade_from = earlier;
  copy.resources.find(({ source }) => source === annotationStarter).document = starter.document;
  return copy;
}

// Published identities must not change. Add a new version/digest instead of updating this pin.
// Pins are the installer's desired pack digest, which covers `upgrade_from`; the beta.4 and
// beta.5 pins match the mdbase CLI's `packs assess`.
const releasedDigests = {
  "1.0.0-beta.3": "sha256:712aa3d2ad5ca8719505b27c8c72f39fb9643660edbbeee3321e01ab53ef6938",
  "1.0.0-beta.4": "sha256:f66f0b5e96df834c2aeab9aaddb4dc6eb6533111892a121ccb2b89ec15660dac",
  "1.0.0-beta.5": "sha256:a8c684491b91ad290a8bd63a3709a949ea58679c69fc600aabba2422da95055b",
  "1.0.0-beta.6": "sha256:82027c429b2e4c061f2e447f3af4004463c969633de2454653e8327a2bda2f54",
  "1.0.0-beta.7": "sha256:3962ae19ef014455a8b147dd6469e6d2e3c77cc9b61e9aabad5b0f54c0283b37",
  "1.0.0-beta.8": "sha256:ae9ba33386a4dc952c7b838983edd4a3400358798fe90206f4dfab2736967c98",
  "1.0.0-beta.9": "sha256:aa3303f08f27f0298163a55e42dca548b1eb46737940b0439e56338c9dc6de10",
};
// The vendored mdbase-contracts view pack, pinned the same way. 1.0.1 ships the version-2
// view starter (no pinned `type`, open top level) with `upgrade_from` the 1.0.0 starter;
// confirmed with the mdbase CLI's `packs assess`.
const releasedViewPackDigests = {
  "1.0.1": "sha256:b32222bce5f16b01b87c34736b0e70bfad3583b5678557fa6c42ee706f7ef1d4",
};
// Every distinct starter Reader shipped before the current one, by the first pack that shipped
// it, newest first: the order the pack lists them as `upgrade_from` baselines. beta.2 changed
// only reader-source, and the beta.3 starters were also served as beta.1 between #20 and #26.
// beta.4 to beta.8 shipped version 2 of reader-annotation, which beta.9 replaces.
const earlierStarters = {
  "types/reader-source.md": {
    "1.0.0-beta.3": "sha256:82869c12234662297cc273aab993732d35827b8a2ba8ad74bec18975cadf0c1a",
    "1.0.0-beta.2": "sha256:54f46e7c3bb70e1cea5a37afa458406a0acf2be7f195c8893160782d87254990",
    "1.0.0-beta.1": "sha256:e8a3fca643d335e684810c2e83bc9e9c3fc702ecf5a23d29283615902e0cfa55",
  },
  "types/reader-annotation.md": {
    "1.0.0-beta.4": "sha256:19e174941e390cb446ec63ea91a43fe26eba9918d70cd9f86ad693cca485628b",
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
  const pack = beforeBeta9(withoutSettings(current));
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
  const pack = beforeBeta9(withoutSettings(current));
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

// A collection is its files by collection path. The helpers never touch a file system: apply
// returns the writes and deletes, which these tests make to the map.
function collection() {
  return { "mdbase.yaml": "spec_version: 0.3.0\n" };
}

function typeKeysConfig(typeKeys) {
  return `spec_version: 0.3.0\nsettings:\n  explicit_type_keys: ${typeKeys}\n`;
}

async function assess(root, pack) {
  return await assessTypePack({ pack: packInput(pack), resources: root, options });
}

async function apply(root, pack, assessment) {
  assert.equal(assessment.applicable, true);
  const applied = await applyTypePack({
    pack: packInput(pack),
    resources: root,
    options,
    expectedDigest: assessment.assessment_digest,
  });
  for (const { path, document } of applied.writes) root[path] = document;
  for (const path of applied.deletes) delete root[path];
}

async function receipt(root, id) {
  return (await parseLock(root["mdbase.lock.yaml"])).packs.find((pack) => pack.id === id);
}

function preserveExamples(root, pack) {
  const contents = new Map();
  for (const resource of pack.manifest.resources) {
    if (resource.mode === "seed") {
      root[resource.target] += "\nCollection-owned customisation: keep this exact type document.\n";
    }
    contents.set(resource.target, root[resource.target]);
  }
  const path = "sources/existing.md";
  root[path] =
    "---\ntype: reader-source\nid: existing-source\ntitle: Existing source\nkind: document\nsaved_at: 2026-08-09T14:21:00+10:00\n---\n\nKeep my literature note.\n";
  contents.set(path, root[path]);
  return contents;
}

function assertPreserved(root, contents) {
  for (const [path, document] of contents) assert.equal(root[path], document, path);
}

// Reader creates a record through the SDK with `{ path, type, frontmatter, body }`, and the
// runtime declares the type under the collection's first explicit type key (spec 12) before it
// renders the new document. These records declare no type key of their own.
async function create(root, { path, type, frontmatter, body = "" }) {
  const [typeKey] = (await loadCatalog(root)).settings.explicit_type_keys;
  assert.equal(Object.hasOwn(frontmatter, typeKey), false, `${path} declares ${typeKey}`);
  const source = `---\n${stringifyYaml({ ...frontmatter, [typeKey]: type })}---\n${body}`;
  return await validateRecord({ resources: root, path, source });
}

// A record validates as exactly `type`, with no issues.
function assertValidRecord(result, type) {
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
  assert.deepEqual(result.types, [type]);
}

// The catalog's implementation of a contract version by a type. Every Reader starter binds
// contract fields to record fields of the same name, so a valid record is its contract view.
async function implementation(root, type, contract, version) {
  const catalog = await loadCatalog(root);
  assert.equal(catalog.valid, true, JSON.stringify(catalog.issues));
  const found = catalog.implementations.filter(
    (candidate) =>
      candidate.type === type && candidate.contract === contract && candidate.version === version,
  );
  assert.equal(found.length, 1, `${type} implements ${contract}@${version}`);
  return found[0];
}

function assertProjects(implementation, fields) {
  for (const field of fields) {
    assert.ok(
      implementation.fields.some(([from, to]) => from === field && to === field),
      `${implementation.contract} reads ${field}`,
    );
  }
}

test("Reader's new pack release preserves contract identities and capability protocol", async () => {
  assert.equal(current.manifest.version, "1.0.0-beta.9");
  const [source, annotation] = withoutSettings(current).provides;
  assert.deepEqual(source, legacy.provides[0]);
  assert.deepEqual(
    [annotation.id, annotation.version],
    ["dev.mdbase.reader.annotation", "1.0.0-beta.2"],
  );
  assert.deepEqual(
    application.requirements.contracts.filter(({ id }) => id === annotation.id),
    [annotation],
  );
  assert.deepEqual(
    current.provides
      .filter(({ id }) => settingsContracts.has(id))
      .map(({ id, version }) => [id, version]),
    [
      ["mdbase.app-settings", "2.0.0"],
      ["dev.mdbase.reader.settings", "1.2.0"],
    ],
  );
  assert.equal(application.requirements.capabilities.contract_version, 2);
  assert.equal(viewPack.manifest.version, "1.0.1");
  assert.deepEqual(
    viewPack.provides.map(({ id, version }) => `${id}@${version}`),
    ["mdbase.view@1.0.0"],
  );
  const assessment = await assess(collection(), viewPack);
  assert.equal(assessment.status, "install");
  assert.equal(assessment.pack.digest, releasedViewPackDigests[viewPack.manifest.version]);
});

test("the released pack digest stays immutable and is independent of deployment origin", async () => {
  const root = collection();
  const assessment = await assess(root, current);
  assert.equal(assessment.status, "install");
  assert.equal(
    assessment.pack.digest,
    releasedDigests[current.manifest.version],
    "Type-pack contents changed: publish a new pack version and add its digest; do not alter an existing release pin.",
  );
  const staging = await buildReaderManifest({ origin: "https://staging.mdbase-reader.pages.dev" });
  assert.deepEqual(staging.provisions.type_packs[0], current);
});

test("settings contracts keep the same fields in their inline schemas", () => {
  const documents = new Map(current.resources.map(({ source, document }) => [source, document]));
  const schema = JSON.parse(documents.get(settingsSchema));
  schema.title = "dev.mdbase.reader.settings 1.2.0";
  assert.deepEqual(
    frontmatter(documents.get("contracts/dev.mdbase.reader.settings/1.2.0.md")).record_schema.value,
    schema,
  );
  assert.deepEqual(frontmatter(documents.get("types/reader-settings.md")).schema.value, schema);
  for (const source of [
    "contracts/mdbase.app-settings/1.0.0.md",
    "schemas/mdbase.app-settings/1.0.0.schema.json",
    "contracts/dev.mdbase.reader.settings/1.1.0.md",
    settingsSchema,
  ]) {
    assert.equal(
      documents.get(source),
      legacyBeta7.resources.find((resource) => resource.source === source).document,
    );
  }
  assert.deepEqual(
    application.requirements.contracts
      .filter(({ id }) => settingsContracts.has(id))
      .map(({ id, version }) => [id, version]),
    [
      ["mdbase.app-settings", "2.0.0"],
      ["dev.mdbase.reader.settings", "1.2.0"],
    ],
  );
});

for (const edited of [false, true]) {
  test(`upgrades beta.7's settings with ${edited ? "an edited" : "an unedited"} starter and retains its contracts`, async () => {
    const root = collection();
    assert.equal((await assess(root, legacyBeta7)).pack.digest, releasedDigests["1.0.0-beta.7"]);
    await apply(root, legacyBeta7, await assess(root, legacyBeta7));
    const typePath = "_types/reader-settings.md";
    if (edited) root[typePath] += "\nCollection note.\n";
    const upgrade = await assess(root, current);
    const seed = upgrade.resources.find(({ source }) => source === "types/reader-settings.md");
    assert.equal(seed.action, "update");
    assert.equal(seed.upgrade_baseline.version, 2);
    for (const resource of legacyBeta7.manifest.resources.filter(
      ({ mode }) => mode === "managed",
    )) {
      assert.equal(
        upgrade.resources.find(({ source }) => source === resource.source).action,
        "unchanged",
      );
    }
    await apply(root, current, upgrade);
    const type = root[typePath];
    assert.equal(frontmatter(type).version, 3);
    if (edited) assert.match(type, /Collection note\./u);
    assert.equal((await assess(root, current)).status, "current");
  });
}

test("seed upgrades list every earlier starter type, newest first, as exact bytes", async () => {
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
    [
      {
        digest: legacyBeta7.manifest.resources.find(({ source }) => source === settingsSeed.source)
          .digest,
        version: 2,
      },
      { digest: beta6Settings.digest, version: 1 },
    ],
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
      assert.equal(version, starterVersion(seed.source, digest) === "1.0.0-beta.4" ? 2 : 1);
    }
  }
  for (const resource of current.manifest.resources.filter(({ mode }) => mode !== "seed")) {
    assert.equal(resource.upgrade_from, undefined);
  }
  // The beta.6 fixture is the released pack, and its starter is the baseline byte for byte.
  assert.equal(
    (await assess(collection(), legacyBeta6)).pack.digest,
    releasedDigests["1.0.0-beta.6"],
  );
  assert.equal(
    settingsSeed.upgrade_from[1].document,
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
    const assessment = await assess(collection(), pack);
    assert.equal(assessment.pack.digest, releasedDigests[version], version);
  }
});

for (const [version, pack] of Object.entries(earlierPacks)) {
  test(`replaces unedited ${version} starters with the exact version-2 seeds`, async () => {
    const root = collection();
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
      assert.equal(root[target.target], resource.document);
    }
    assert.equal((await assess(root, current)).status, "current");
  });
}

// beta.1's starters had top-level `match` rules that later starters removed. A seed edited
// since beta.1 is merged against beta.1, so that removal is the publisher's: 05A requires a
// top-level removal to be reviewed by hand, so the upgrade fails closed instead of merging
// against beta.3 and silently restoring the rule as if it were the collection's edit.
test("fails closed on an edited beta.1 starter instead of restoring its match rule", async () => {
  const root = collection();
  await apply(root, legacy, await assess(root, legacy));
  const sourceType = "_types/reader-source.md";
  const original = root[sourceType];
  assert.equal(frontmatter(original).match.path_glob, "sources/**/*.md");
  const edited = original.replace("\ndescription: ", "\ndescription: Collection edit. ");
  root[sourceType] = edited;
  const upgrade = await assess(root, current);
  assert.equal(upgrade.status, "conflict");
  assert.equal(upgrade.applicable, false);
  const seeds = new Map(upgrade.resources.map((resource) => [resource.source, resource]));
  assert.equal(seeds.get("types/reader-source.md").action, "conflict");
  assert.match(
    seeds.get("types/reader-source.md").reason,
    /removing top-level setting match requires manual review/u,
  );
  // The unedited annotation starter is still replaced from its own beta.1 baseline.
  assert.equal(seeds.get("types/reader-annotation.md").action, "update");
  assert.deepEqual(seeds.get("types/reader-annotation.md").upgrade_baseline, {
    digest: earlierStarters["types/reader-annotation.md"]["1.0.0-beta.1"],
    version: 1,
  });
  assert.equal(root[sourceType], edited);
});

test("merges an edited beta.1 starter against the beta.1 baseline", async () => {
  const root = collection();
  await apply(root, legacy, await assess(root, legacy));
  const sourceType = "_types/reader-source.md";
  // The collection edited its description and, like every later starter, dropped `match`.
  const edited = root[sourceType]
    .replace("\ndescription: ", "\ndescription: Collection edit. ")
    .replace(/\nmatch:\n(?: {2}.*\n)+/u, "\n");
  assert.equal(Object.hasOwn(frontmatter(edited), "match"), false);
  root[sourceType] = edited;
  const upgrade = await assess(root, current);
  assert.equal(upgrade.applicable, true);
  const seed = upgrade.resources.find(({ source }) => source === "types/reader-source.md");
  assert.equal(seed.action, "update");
  assert.deepEqual(seed.upgrade_baseline, {
    digest: earlierStarters["types/reader-source.md"]["1.0.0-beta.1"],
    version: 1,
  });
  await apply(root, current, upgrade);
  const type = frontmatter(root[sourceType]);
  assert.equal(type.version, 2);
  assert.match(type.description, /^Collection edit\. /u);
  assert.equal(Object.hasOwn(type, "match"), false);
  assert.equal(Object.hasOwn(type.schema.value.properties, "type"), false);
  assert.equal(type.schema.value.required.includes("type"), false);
  assert.equal((await assess(root, current)).status, "current");
});

// With no recorded origin the engine infers the merge base: the nearest earlier starter that
// merges cleanly into a type implementing what the current one does. beta.1 itself cannot be
// the base (removing its top-level `match` needs manual review), so beta.3 is, and the merge
// keeps beta.1's `match` alongside the collection's edit.
test("merges an edited seed whose lock predates recorded origins against an inferred baseline", async () => {
  const root = collection();
  await apply(root, legacy, await assess(root, legacy));
  const lock = parseYaml(root["mdbase.lock.yaml"]);
  // Locks written before mdbase-spec 05A recorded seed origins have no origin_digest.
  for (const resource of lock.packs[0].resources) {
    if (resource.mode !== "seed") continue;
    assert.ok(resource.origin_digest, resource.source);
    delete resource.origin_digest;
  }
  root["mdbase.lock.yaml"] = stringifyYaml(lock);
  const sourceType = "_types/reader-source.md";
  const edited = `${root[sourceType]}\nCollection note.\n`;
  root[sourceType] = edited;
  const upgrade = await assess(root, current);
  assert.equal(upgrade.applicable, true);
  const seeds = new Map(upgrade.resources.map((resource) => [resource.source, resource]));
  assert.equal(seeds.get("types/reader-source.md").action, "update");
  assert.deepEqual(seeds.get("types/reader-source.md").upgrade_baseline, {
    digest: earlierStarters["types/reader-source.md"]["1.0.0-beta.3"],
    version: 1,
  });
  // Unedited bytes still prove their origin.
  assert.equal(seeds.get("types/reader-annotation.md").action, "update");
  assert.deepEqual(seeds.get("types/reader-annotation.md").upgrade_baseline, {
    digest: earlierStarters["types/reader-annotation.md"]["1.0.0-beta.1"],
    version: 1,
  });
  await apply(root, current, upgrade);
  assert.equal(frontmatter(root[sourceType]).version, 2);
  assert.match(root[sourceType], /Collection note\./u);
  assert.equal((await assess(root, current)).status, "current");
});

for (const edited of [false, true]) {
  test(`upgrades ${edited ? "an edited" : "an unedited"} beta.3 starter to the version-2 seed`, async () => {
    const root = collection();
    const installed = beta3();
    await apply(root, installed, await assess(root, installed));
    const sourceType = "_types/reader-source.md";
    if (edited) {
      root[sourceType] = root[sourceType].replace(
        "\ndescription: ",
        "\ndescription: Collection edit. ",
      );
    }
    const upgrade = await assess(root, current);
    assert.equal(upgrade.status, "upgrade");
    assert.equal(upgrade.applicable, true);
    for (const resource of upgrade.resources) {
      if (isNew(resource)) {
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
    await apply(root, current, upgrade);
    assert.equal((await receipt(root, current.manifest.id)).version, current.manifest.version);
    const desired = new Map(current.resources.map(({ source, document }) => [source, document]));
    for (const resource of current.manifest.resources.filter(({ mode }) => mode === "seed")) {
      const document = root[resource.target];
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
    const schema = type.schema.value;
    assert.equal(
      type.version,
      isSettings(resource) || resource.source === annotationStarter ? 3 : 2,
      resource.source,
    );
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
  test(`records created by type name are valid where explicit_type_keys is ${typeKeys}`, async () => {
    const root = collection();
    await apply(root, current, await assess(root, current));
    root["mdbase.yaml"] = typeKeysConfig(typeKeys);
    const source = await create(root, {
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
    });
    assertValidRecord(source, "reader-source");
    const annotation = await create(root, {
      path: "annotations/example.md",
      type: "reader-annotation",
      frontmatter: {
        id: "ann_example",
        // Reader links sources by path (see sourceLink); IDs resolve only with id_field.
        source: "[[sources/example|Example source]]",
        annotation_type: "highlight",
        created_at: "2026-08-09T14:22:00+10:00",
      },
    });
    assertValidRecord(annotation, "reader-annotation");
  });

  test(`view records created by type name are valid where explicit_type_keys is ${typeKeys}`, async () => {
    // mdbase.view 1.0.1's version-2 starter keeps `match: { where: { type: view } }` for
    // hand-written records; a create that names the type is explicit membership regardless.
    const root = collection();
    await apply(root, viewPack, await assess(root, viewPack));
    root["mdbase.yaml"] = typeKeysConfig(typeKeys);
    const created = await create(root, {
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
    assertValidRecord(created, "view");
    assertProjects(await implementation(root, "view", "mdbase.view", "1.0.0"), ["name"]);
  });
}

for (const typeKeys of ["[type]", "[mdbase_type]"]) {
  test(`the settings record validates against the managed schema where explicit_type_keys is ${typeKeys}`, async () => {
    const root = collection();
    await apply(root, current, await assess(root, current));
    root["mdbase.yaml"] = typeKeysConfig(typeKeys);
    const settings = {
      app: "dev.mdbase.reader",
      scope: "collection",
      settings_version: 1,
      source_name_template: "{{ year }}/{{ title | slug }}",
      highlight_colors: ["pink", "yellow"],
      highlight_meanings: { pink: "Question" },
    };
    const created = await create(root, {
      path: "_mdbase/settings/dev.mdbase.reader.md",
      type: "reader-settings",
      frontmatter: settings,
    });
    assertValidRecord(created, "reader-settings");
    for (const [contract, version, fields] of [
      ["mdbase.app-settings", "2.0.0", ["app", "scope", "settings_version"]],
      [
        "dev.mdbase.reader.settings",
        "1.2.0",
        ["app", "source_name_template", "highlight_colors", "highlight_meanings"],
      ],
    ]) {
      assertProjects(await implementation(root, "reader-settings", contract, version), fields);
    }
    for (const [path, frontmatter, code] of [
      [
        "_mdbase/settings/empty-template.md",
        { ...settings, source_name_template: "" },
        "schema_min_length",
      ],
      ["_mdbase/settings/other-app.md", { ...settings, app: "tasknotes" }, "schema_const"],
      ["_mdbase/settings/no-colours.md", { ...settings, highlight_colors: [] }, "schema_min_items"],
      [
        "_mdbase/settings/twice.md",
        { ...settings, highlight_colors: ["pink", "pink"] },
        "schema_unique_items",
      ],
      ["_mdbase/settings/orange.md", { ...settings, highlight_colors: ["orange"] }, "schema_enum"],
      [
        "_mdbase/settings/long-meaning.md",
        { ...settings, highlight_meanings: { pink: "x".repeat(41) } },
        "schema_max_length",
      ],
    ]) {
      const refused = await create(root, { path, type: "reader-settings", frontmatter });
      assert.ok(
        refused.issues.some((issue) => issue.code === code && issue.severity === "error"),
        JSON.stringify(refused.issues),
      );
    }
  });
}

for (const edited of [false, true]) {
  test(`upgrades beta.6's settings to contract 1.2.0 with ${edited ? "an edited" : "an unedited"} starter`, async () => {
    const root = collection();
    await apply(root, legacyBeta6, await assess(root, legacyBeta6));
    // A record written by beta.6 Reader stays a valid 1.1.0 record.
    const recordPath = "_settings/dev.mdbase.reader.md";
    const record =
      '---\ntype: reader-settings\napp: dev.mdbase.reader\nscope: collection\nsettings_version: 1\nannotation_name_template: "{{ date }}-{{ short_id }}"\n---\n';
    root[recordPath] = record;
    const settingsType = "_types/reader-settings.md";
    if (edited) root[settingsType] += "\nCollection note.\n";
    const upgrade = await assess(root, current);
    assert.equal(upgrade.status, "upgrade");
    assert.equal(upgrade.applicable, true);
    // A retired resource has no source in the new pack, so actions are keyed by target.
    const actions = Object.fromEntries(
      upgrade.resources.map(({ target, action }) => [target, action]),
    );
    assert.deepEqual(actions, {
      "_contracts/dev.mdbase.reader.source.md": "unchanged",
      "_contracts/dev.mdbase.reader.annotation.md": "unchanged",
      "_contracts/dev.mdbase.reader.annotation/1.0.0-beta.2.md": "create",
      "_types/reader-source.md": "preserve",
      "_types/reader-annotation.md": "update",
      "schemas/mdbase.app-settings/1.0.0.schema.json": "unchanged",
      "_contracts/mdbase.app-settings/1.0.0.md": "unchanged",
      "schemas/dev.mdbase.reader.settings/1.1.0.schema.json": "create",
      "_contracts/dev.mdbase.reader.settings/1.1.0.md": "create",
      "_contracts/mdbase.app-settings/2.0.0.md": "create",
      "_contracts/dev.mdbase.reader.settings/1.2.0.md": "create",
      "_types/reader-settings.md": "update",
      "schemas/dev.mdbase.reader.settings/1.0.0.schema.json": "delete",
      "_contracts/dev.mdbase.reader.settings/1.0.0.md": "delete",
    });
    const seed = upgrade.resources.find(({ source }) => source === "types/reader-settings.md");
    assert.deepEqual(seed.upgrade_baseline, {
      digest: legacyBeta6.manifest.resources.find(({ source }) => source === seed.source).digest,
      version: 1,
    });
    await apply(root, current, upgrade);
    for (const source of retiredSettings) {
      const target = legacyBeta6.manifest.resources.find((resource) => resource.source === source);
      assert.equal(Object.hasOwn(root, target.target), false, target.target);
    }
    const type = root[settingsType];
    if (edited) {
      // Three-way merge: the collection's note survives alongside version 2's changes.
      assert.equal(frontmatter(type).version, 3);
      assert.equal(frontmatter(type).schema.value.title, "dev.mdbase.reader.settings 1.2.0");
      assert.match(type, /Collection note\./u);
    } else {
      assert.equal(type, current.resources.find(({ source }) => source === seed.source).document);
    }
    assert.equal(root[recordPath], record);
    assert.equal((await assess(root, current)).status, "current");
    assertValidRecord(
      await validateRecord({ resources: root, path: recordPath, source: record }),
      "reader-settings",
    );
    assertProjects(
      await implementation(root, "reader-settings", "dev.mdbase.reader.settings", "1.2.0"),
      ["annotation_name_template"],
    );
  });
}

// The engine does not refuse a released version whose contents changed: it assesses it as an
// upgrade. The release pins above are what keep Reader's pack versions immutable.
test("a reused beta.1 version with new contents upgrades, and edited beta.1 seeds still fail closed", async () => {
  const root = collection();
  await apply(root, legacy, await assess(root, legacy));
  const reusedVersion = structuredClone(current);
  reusedVersion.manifest.version = legacy.manifest.version;
  const reused = await assess(root, reusedVersion);
  assert.equal(reused.status, "upgrade");
  assert.equal(reused.applicable, true);
  assert.notEqual(reused.pack.digest, (await receipt(root, legacy.manifest.id)).digest);
  const contents = preserveExamples(root, legacy);
  const edited = await assess(root, reusedVersion);
  assert.equal(edited.status, "conflict");
  assert.equal(edited.applicable, false);
  assertPreserved(root, contents);
});

// original-beta.1's seeds are version-1 starters the collection edited. They are merged
// against the beta.1 starters they were installed from (not beta.3's, which would restore
// beta.1's removed `match` rules as if they were collection edits), and that removal needs
// manual review, so the upgrade fails closed and touches nothing.
// changed-beta.1 already shipped the version-2 starters, so the edited seeds are kept as is.
for (const variant of ["original-beta.1", "changed-beta.1"]) {
  test(`upgrades ${variant} to the current pack preserving contracts, customized seed types and notes`, async () => {
    const root = collection();
    const original = variant === "original-beta.1";
    const installed = original ? structuredClone(legacy) : withoutSettings(current);
    installed.manifest.version = "1.0.0-beta.1";
    await apply(root, installed, await assess(root, installed));
    const contents = preserveExamples(root, installed);
    const upgrade = await assess(root, current);
    if (original) {
      assert.equal(upgrade.status, "conflict");
      assert.equal(upgrade.applicable, false);
      for (const resource of upgrade.resources.filter((resource) => !isNew(resource))) {
        assert.equal(resource.action, resource.mode === "seed" ? "conflict" : "unchanged");
        if (resource.mode === "seed")
          assert.match(resource.reason, /removing top-level setting match requires manual review/u);
      }
      assertPreserved(root, contents);
      return;
    }
    assert.equal(upgrade.status, "upgrade");
    assert.equal(upgrade.applicable, true);
    for (const resource of upgrade.resources) {
      const expected = resource.mode === "seed" ? "preserve" : "unchanged";
      assert.equal(resource.action, isSettings(resource) ? "create" : expected, resource.source);
    }
    await apply(root, current, upgrade);
    assert.equal((await receipt(root, current.manifest.id)).version, current.manifest.version);
    assertPreserved(root, contents);
    const again = await assess(root, current);
    assert.equal(again.status, "current");
    assert.equal(again.applicable, true);
    await apply(root, current, again);
    assertPreserved(root, contents);
  });
}

for (const edited of [false, true]) {
  test(`upgrades beta.8's annotation starter to version 3 with ${edited ? "an edited" : "an unedited"} starter and keeps contract 1.0.0-beta.1`, async () => {
    const root = collection();
    const installed = await assess(root, legacyBeta8);
    assert.equal(installed.pack.digest, releasedDigests["1.0.0-beta.8"]);
    await apply(root, legacyBeta8, installed);
    const typePath = "_types/reader-annotation.md";
    if (edited) root[typePath] += "\nCollection note.\n";
    const upgrade = await assess(root, current);
    assert.equal(upgrade.status, "upgrade");
    assert.equal(upgrade.applicable, true);
    const actions = new Map(upgrade.resources.map(({ source, action }) => [source, action]));
    assert.equal(actions.get(annotationStarter), "update");
    assert.equal(actions.get(annotationContract), "create");
    for (const resource of legacyBeta8.manifest.resources.filter(
      ({ mode }) => mode === "managed",
    )) {
      assert.equal(actions.get(resource.source), "unchanged", resource.source);
    }
    const seed = upgrade.resources.find(({ source }) => source === annotationStarter);
    assert.deepEqual(seed.upgrade_baseline, {
      digest: legacyBeta8.manifest.resources.find(({ source }) => source === annotationStarter)
        .digest,
      version: 2,
    });
    await apply(root, current, upgrade);
    const type = root[typePath];
    const merged = frontmatter(type);
    assert.equal(merged.version, 3);
    assert.deepEqual(merged.schema.value.properties.document.required, ["file", "revision"]);
    assert.equal(merged.implements[0].version, "1.0.0-beta.2");
    if (edited) assert.match(type, /Collection note\./u);
    else {
      assert.equal(
        type,
        current.resources.find(({ source }) => source === annotationStarter).document,
      );
    }
    // Collections whose own annotation type still implements beta.1 keep that contract.
    assert.equal(
      root["_contracts/dev.mdbase.reader.annotation.md"],
      legacyBeta8.resources.find(
        ({ source }) => source === "contracts/dev.mdbase.reader.annotation.md",
      ).document,
    );
    assert.equal((await assess(root, current)).status, "current");
  });
}

// Single-record validation: whether `[[files/paper.pdf]]` resolves is a cross-record check.
test("an annotation names its document by file link, with or without a Connect file ID", async () => {
  const root = collection();
  await apply(root, current, await assess(root, current));
  const revision = `sha256:${"a".repeat(64)}`;
  const source = await create(root, {
    path: "sources/example.md",
    type: "reader-source",
    frontmatter: {
      id: "src_example",
      title: "Example source",
      kind: "document",
      saved_at: "2026-08-09T14:21:00+10:00",
      documents: [{ file: "[[files/paper.pdf]]", media_type: "application/pdf", revision }],
    },
  });
  assertValidRecord(source, "reader-source");
  assertProjects(
    await implementation(root, "reader-annotation", "dev.mdbase.reader.annotation", "1.0.0-beta.2"),
    ["document"],
  );
  for (const [name, document] of [
    ["by-path", { file: "[[files/paper.pdf]]", revision }],
    [
      "with-id",
      { file_id: "01a1bea5-149d-77a7-b8d4-7c91c2da0783", file: "[[files/paper.pdf]]", revision },
    ],
  ]) {
    const created = await create(root, {
      path: `annotations/${name}.md`,
      type: "reader-annotation",
      frontmatter: {
        id: `ann_${name}`,
        source: "[[sources/example|Example source]]",
        document,
        annotation_type: "highlight",
        created_at: "2026-08-09T14:22:00+10:00",
      },
    });
    assertValidRecord(created, "reader-annotation");
  }
  const refused = await create(root, {
    path: "annotations/no-file.md",
    type: "reader-annotation",
    frontmatter: {
      id: "ann_no_file",
      source: "[[sources/example|Example source]]",
      document: { file_id: "01a1bea5-149d-77a7-b8d4-7c91c2da0783", revision },
      annotation_type: "highlight",
      created_at: "2026-08-09T14:22:00+10:00",
    },
  });
  assert.ok(
    refused.issues.some(
      (issue) => issue.code === "schema_required" && issue.location === "/document/file",
    ),
    JSON.stringify(refused.issues),
  );
});
