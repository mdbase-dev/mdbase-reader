import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { dataContractDigest } from "@callumalpass/mdbase";
import { parse as parseYaml } from "yaml";

// Pack releases are immutable independently of the data contracts they provide.
// beta.2 was used historically; do not reuse it even though the contracts remain beta.1.
// beta.4 ships version 2 of the starter types, which no longer pin or require `type`.
export const READER_TYPE_PACK_VERSION = "1.0.0-beta.4";

const projectRoot = resolve(import.meta.dirname, "..");
// Reader saves library views as mdbase.view records; this is the published
// mdbase-contracts provision, embedded byte-for-byte.
const viewPackPath = resolve(projectRoot, "mdbase", "packs", "mdbase.view-1.0.0.json");
// Seed types belong to the collection once installed. Version 1 (pack beta.3) declared
// `type: { const: <name> }` and required `type`, which fails in collections whose
// settings.explicit_type_keys record the type elsewhere (such as `[mdbase_type]`, where
// `type` holds CSL data). Each seed therefore names the exact previous bytes it replaces,
// so Connect can offer a reviewed three-way upgrade that keeps collection edits.
// Baselines under mdbase/baselines/ are released bytes: never edit them.
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
    upgradeFrom: "baselines/1.0.0-beta.3/types/reader-source.md",
  },
  {
    kind: "type",
    mode: "seed",
    source: "types/reader-annotation.md",
    target: "_types/reader-annotation.md",
    upgradeFrom: "baselines/1.0.0-beta.3/types/reader-annotation.md",
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
      const baseline = resource.upgradeFrom
        ? await readFile(resolve(projectRoot, "mdbase", resource.upgradeFrom), "utf8")
        : undefined;
      return {
        ...resource,
        digest: digest(document),
        document,
        ...(baseline === undefined
          ? {}
          : { upgrade_from: { digest: digest(baseline), document: baseline } }),
        ...(resource.kind === "contract"
          ? { contractDigest: dataContractDigest(parseFrontmatter(document)) }
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
        required: ["list", "read", "add"],
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

function digest(document) {
  return `sha256:${createHash("sha256").update(document).digest("hex")}`;
}

function parseFrontmatter(document) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(document);
  if (!match?.[1]) {
    throw new Error("Reader contract resource has no YAML frontmatter.");
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

/**
 * A type-pack provision in the form @callumalpass/mdbase's JavaScript installer accepts.
 * That installer predates `upgrade_from` and rejects it, so Reader's local installation
 * checks drop the seed baselines; it then preserves installed seeds as before. Connect's
 * engine is what applies the reviewed seed upgrades.
 */
export function referenceInstallerProvision(pack) {
  return {
    manifest: {
      ...pack.manifest,
      resources: pack.manifest.resources.map((resource) => {
        const accepted = { ...resource };
        delete accepted.upgrade_from;
        return accepted;
      }),
    },
    resources: pack.resources,
  };
}
