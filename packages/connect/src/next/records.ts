// mdbase-next backend: record views and queries in the shapes Reader's repositories read.
import { toPlain, type Include, type Query, type RecordView } from "@mdbase-dev/sdk";

import { annotationContract, sourceContract } from "../contracts.js";

import type {
  DataContractSelector,
  JsonObject,
  QueryInput,
  QueryMetadataInput,
  QueryRecord,
  RecordDocument,
} from "@mdbase-dev/connect";

/**
 * The new client API has no semantic contract views. Reader owns its types, so a
 * contract selector reads the type that implements it in Reader's starter pack.
 */
const contractTypes: Readonly<Record<string, string>> = {
  [sourceContract.id]: "reader-source",
  [annotationContract.id]: "reader-annotation",
};

export function typeForContract(contract: DataContractSelector | undefined): string | undefined {
  return contract ? (contract.type ?? contractTypes[contract.id]) : undefined;
}

function plainObject(map: RecordView["frontmatter"] | undefined): JsonObject | undefined {
  return map ? (toPlain(map) as JsonObject) : undefined;
}

function fileFields(view: RecordView): RecordDocument["file"] {
  const slash = view.path.lastIndexOf("/");
  const name = view.path.slice(slash + 1);
  return { path: view.path, name, folder: slash < 0 ? "" : view.path.slice(0, slash) };
}

/** A replica record view as a Connect record document. */
export function recordDocument(view: RecordView): RecordDocument {
  const frontmatter = plainObject(view.frontmatter) ?? {};
  return {
    path: view.path,
    revision: view.revision,
    types: [...view.types],
    frontmatter,
    effectiveFrontmatter: plainObject(view.effective) ?? frontmatter,
    ...(view.body === undefined ? {} : { body: view.body }),
    ...(view.document === undefined ? {} : { document: view.document }),
    file: fileFields(view),
  };
}

/** A replica record view as a Connect query row (always revision-qualified). */
export function queryRecord(view: RecordView): QueryRecord {
  const frontmatter = plainObject(view.frontmatter) ?? {};
  return {
    path: view.path,
    revision: view.revision,
    types: [...view.types],
    frontmatter,
    effectiveFrontmatter: plainObject(view.effective) ?? frontmatter,
    ...(view.body === undefined ? {} : { body: view.body }),
    file: fileFields(view),
  };
}

/** What to return with each record. Bodies only when the caller asked for them. */
export function readInclude(options: {
  readonly includeBody?: boolean;
  readonly includeDocument?: boolean;
  readonly frontmatterMode?: QueryInput["frontmatterMode"];
}): Include {
  return {
    ...(options.includeBody ? { body: true } : {}),
    ...(options.includeDocument ? { body: true, document: true } : {}),
    ...(options.frontmatterMode === "persisted" ? {} : { effective: true }),
  };
}

/**
 * Connect query input as a spec 11 query. Projections, grouping and summaries have
 * no equivalent in the replica's record query, so they are dropped here: callers
 * that read projected `values` fall back to frontmatter.
 */
export function nextQuery(input: QueryInput | QueryMetadataInput): Query {
  const type = typeForContract(input.contract);
  const types = input.types ?? (type ? [type] : undefined);
  return {
    ...(types ? { types } : {}),
    ...(input.where ? { where: input.where } : {}),
    ...(input.orderBy?.length
      ? {
          order_by: input.orderBy.map(({ field, direction }) => ({
            field,
            direction: direction ?? "asc",
          })),
        }
      : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.context ? { context: { this: { path: input.context.this.path } } } : {}),
  };
}
