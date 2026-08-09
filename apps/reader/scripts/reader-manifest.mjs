import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { dataContractDigest } from "@callumalpass/mdbase";
import { parse as parseYaml } from "yaml";

export const READER_TYPE_PACK_VERSION = "1.0.0-beta.1";

const projectRoot = resolve(import.meta.dirname, "..");
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
  },
  {
    kind: "type",
    mode: "seed",
    source: "types/reader-annotation.md",
    target: "_types/reader-annotation.md",
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
      return {
        ...resource,
        digest: digest(document),
        document,
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

  return {
    manifest_version: 1,
    id: "dev.mdbase.reader",
    name: "mdbase Reader",
    homepage: appUrl,
    icon: new URL("favicon.svg", appUrl).href,
    redirect_uris: [appUrl],
    requirements: {
      access: "full_collection",
      contracts,
      capabilities: {
        contract_version: 1,
        required: [
          "collection.inspect",
          "records.read",
          "records.query",
          "records.create",
          "records.update",
          "files.list",
          "files.read",
          "files.add",
          "definitions.contracts.current",
          "collection.setup.apply",
        ],
      },
      files: {
        actions: ["list", "read", "add"],
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
  };
}
