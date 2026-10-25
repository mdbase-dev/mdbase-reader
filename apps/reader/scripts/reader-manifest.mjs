import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { dataContractDigest } from "@callumalpass/mdbase";
import { parse as parseYaml } from "yaml";

import { readerDeployments } from "./deployment-environment.mjs";

// Pack releases are immutable independently of the data contracts they provide.
// beta.2 was used historically; do not reuse it even though the contracts remain beta.1.
// beta.4 ships version 2 of the starter types, which no longer pin or require `type`.
// beta.5 ships the same starters and lists every earlier starter as an upgrade baseline.
// beta.6 adds collection settings: the mdbase.app-settings and dev.mdbase.reader.settings
// contracts with their managed schemas, and a reader-settings starter that references them.
export const READER_TYPE_PACK_VERSION = "1.0.0-beta.6";

const projectRoot = resolve(import.meta.dirname, "..");
// Reader saves library views as mdbase.view records; this is the published
// mdbase-contracts provision, embedded byte-for-byte.
const viewPackPath = resolve(projectRoot, "mdbase", "packs", "mdbase.view-1.0.1.json");
// Seed types belong to the collection once installed. Version 1 (packs beta.1 to beta.3)
// declared `type: { const: <name> }` and required `type`, which fails in collections whose
// settings.explicit_type_keys record the type elsewhere (such as `[mdbase_type]`, where
// `type` holds CSL data). Each seed therefore lists the exact bytes of every starter Reader
// has shipped for it, newest first, so Connect can offer a reviewed upgrade from any of
// them: an unedited starter is replaced, and an edited one is merged three-way against the
// starter it was installed from, keeping collection edits.
// Baselines under mdbase/baselines/<pack version>/ are released bytes: never edit them.
// A pack version that shipped a starter identical to an earlier one has no copy of it:
// beta.2 changed only reader-source, and the beta.3 starters also shipped late in beta.1.
const resources = [
  {
    kind: "contract",
    mode: "managed",
    source: "contracts/dev.mdbase.reader.source.md",
    target: "_contracts/dev.mdbase.reader.source.md",
  },
  {
    kind: "contract",
    mode: "managed",
    source: "contracts/dev.mdbase.reader.annotation.md",
    target: "_contracts/dev.mdbase.reader.annotation.md",
  },
  {
    kind: "type",
    mode: "seed",
    source: "types/reader-source.md",
    target: "_types/reader-source.md",
    upgradeFrom: [
      "baselines/1.0.0-beta.3/types/reader-source.md",
      "baselines/1.0.0-beta.2/types/reader-source.md",
      "baselines/1.0.0-beta.1/types/reader-source.md",
    ],
  },
  {
    kind: "type",
    mode: "seed",
    source: "types/reader-annotation.md",
    target: "_types/reader-annotation.md",
    upgradeFrom: [
      "baselines/1.0.0-beta.3/types/reader-annotation.md",
      "baselines/1.0.0-beta.1/types/reader-annotation.md",
    ],
  },
  // The settings contracts and schemas use the mdbase-contracts layout and targets
  // (`contracts/<id>/<version>.md`, `schemas/<id>/<version>.schema.json`), so they can move
  // there unchanged.
  {
    kind: "schema",
    mode: "managed",
    source: "schemas/mdbase.app-settings/1.0.0.schema.json",
    target: "schemas/mdbase.app-settings/1.0.0.schema.json",
  },
  {
    kind: "contract",
    mode: "managed",
    source: "contracts/mdbase.app-settings/1.0.0.md",
    target: "_contracts/mdbase.app-settings/1.0.0.md",
  },
  {
    kind: "schema",
    mode: "managed",
    source: "schemas/dev.mdbase.reader.settings/1.0.0.schema.json",
    target: "schemas/dev.mdbase.reader.settings/1.0.0.schema.json",
  },
  {
    kind: "contract",
    mode: "managed",
    source: "contracts/dev.mdbase.reader.settings/1.0.0.md",
    target: "_contracts/dev.mdbase.reader.settings/1.0.0.md",
  },
  {
    // Nobody needs to customise a settings schema, so this starter references the managed
    // schema instead of carrying a snapshot of it (docs/design/app-settings.md).
    kind: "type",
    mode: "seed",
    source: "types/reader-settings.md",
    target: "_types/reader-settings.md",
  },
];

export async function buildReaderManifest({
  origin = "https://reader.mdbase.dev",
  basePath = "/",
} = {}) {
  const normalizedOrigin = origin.replace(/\/$/u, "");
  const appUrl = new URL(normalizeBasePath(basePath), `${normalizedOrigin}/`).href;
  const packResources = await Promise.all(
    resources.map(async (resource) => {
      const document = await readFile(resolve(projectRoot, "mdbase", resource.source), "utf8");
      const baselines = await Promise.all(
        (resource.upgradeFrom ?? []).map(async (path) => {
          const baseline = await readFile(resolve(projectRoot, "mdbase", path), "utf8");
          return {
            digest: digest(baseline),
            version: parseFrontmatter(baseline).version,
            document: baseline,
          };
        }),
      );
      return {
        ...resource,
        digest: digest(document),
        document,
        ...(baselines.length === 0 ? {} : { upgrade_from: baselines }),
        ...(resource.kind === "contract"
          ? { contractDigest: await contractDigest(resource.source, document) }
          : {}),
      };
    }),
  );
  const contracts = packResources
    .filter((resource) => resource.kind === "contract")
    .map((resource) => {
      const contract = parseFrontmatter(resource.document);
      return {
        id: contract.id,
        version: contract.version,
        digest: resource.contractDigest,
      };
    });

  const viewPack = JSON.parse(await readFile(viewPackPath, "utf8"));

  return {
    manifest_version: 1,
    id: "dev.mdbase.reader",
    name: "mdbase Reader",
    homepage: appUrl,
    icon: new URL("favicon.svg", appUrl).href,
    redirect_uris: [appUrl],
    // The one app identity installs from its exact origin in each environment;
    // the SDK refuses an origin not declared for the build's environment.
    installation_origins: readerInstallationOrigins({ labOrigin: normalizedOrigin }),
    requirements: {
      access: "full_collection",
      contracts: [...contracts, ...viewPack.provides],
      // Contract readiness and collection setup are derived from `contracts` and
      // `provisions`; version 2 has no capability identifiers for them.
      capabilities: {
        contract_version: 2,
        required: ["collection.read", "records.create", "records.edit", "records.delete"],
      },
      files: {
        // Next accounts approve each record capability together with its file
        // actions: editing needs replace and move, deleting needs delete.
        required: ["list", "read", "add", "replace", "move", "delete"],
        scope: { kind: "collection" },
      },
    },
    provisions: {
      type_packs: [
        {
          provides: contracts,
          manifest: {
            kind: "mdbase.type-pack",
            id: "dev.mdbase.reader",
            version: READER_TYPE_PACK_VERSION,
            name: "mdbase Reader",
            description: "Reader source and annotation contracts with starter implementations.",
            resources: packResources.map(manifestResource),
          },
          resources: packResources.map(({ source, document }) => ({ source, document })),
        },
        viewPack,
      ],
    },
  };
}

export function readerInstallationOrigins({ labOrigin } = {}) {
  const origins = Object.fromEntries(
    Object.entries(readerDeployments).map(([environment, deployment]) => [
      environment,
      { "app-runtime": [deployment.origin] },
    ]),
  );
  // Only an explicitly requested LAB development manifest carries this exact
  // app-loopback origin. Staging/production policies remain HTTPS-only.
  if (labOrigin) {
    const url = new URL(labOrigin);
    if (
      url.origin === labOrigin &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    ) {
      origins.lab = { "app-runtime": [labOrigin] };
    }
  }
  return origins;
}

/**
 * A contract's digest covers its schemas, not their wrappers: a `ref` is replaced by the schema
 * it names, read from the pack, as mdbase-contracts does when it publishes a pack.
 */
async function contractDigest(source, document) {
  const contract = parseFrontmatter(document);
  for (const field of ["record_schema", "binding_schema"]) {
    const wrapper = contract[field];
    if (wrapper && typeof wrapper.ref === "string") {
      const path = resolve(projectRoot, "mdbase", dirname(source), wrapper.ref);
      contract[field] = { value: JSON.parse(await readFile(path, "utf8")) };
    }
  }
  return dataContractDigest(contract);
}

function digest(document) {
  return `sha256:${createHash("sha256").update(document).digest("hex")}`;
}

function parseFrontmatter(document) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(document);
  if (!match?.[1]) {
    throw new Error("Reader pack resource has no YAML frontmatter.");
  }
  return parseYaml(match[1]);
}

function normalizeBasePath(value) {
  return `/${value.replace(/^\/+|\/+$/gu, "")}/`.replace(/^\/\/$/u, "/");
}

function manifestResource(resource) {
  return {
    kind: resource.kind,
    mode: resource.mode,
    source: resource.source,
    target: resource.target,
    digest: resource.digest,
    ...(resource.upgrade_from ? { upgrade_from: resource.upgrade_from } : {}),
  };
}
