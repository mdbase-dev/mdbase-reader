import {
  annotationSourceAt,
  annotationSourceFromResult,
  stringField,
  withResolvedSource,
} from "./annotation-source.js";
import {
  ConnectRepositoryError,
  mapConcurrent,
  outcomeValue,
  readerConnectBulkConcurrency,
} from "./repository-client.js";

import type {
  QueryRecord,
  QueryMetadataRecord,
  QueryPage,
  QueryMetadataPage,
} from "./connect-types.js";
import type { ReaderConnectClient } from "./repository-client.js";
import type { AnnotationListOptions, SourceId } from "@mdbase-reader/core";

export async function* annotationSourcePages(
  client: ReaderConnectClient,
  options: AnnotationListOptions,
): AsyncGenerator<
  { readonly path: string; readonly source: SourceId; readonly reference: unknown }[]
> {
  if (options.paths?.size === 0) {
    return;
  }
  for (const scope of annotationQueryScopes(options.paths)) {
    const selected = scope ? new Set(scope) : null;
    options.signal?.throwIfAborted();
    const input = {
      types: ["reader-annotation"],
      frontmatterMode: "effective" as const,
      includeBody: false,
      ...(scope
        ? { where: scope.map((path) => `file.path == ${JSON.stringify(path)}`).join(" || ") }
        : {}),
    };
    const paging = {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.replaceableFamily ? { replaceableFamily: options.replaceableFamily } : {}),
      pageSize: 500,
    };
    let published = false;
    try {
      const pages = client.queryPages(
        withResolvedSource({ ...input, select: ["id", "source"] }),
        paging,
      );
      for await (const outcome of pages) {
        const records = outcomeValue<QueryPage | QueryMetadataPage>(
          outcome,
          "query annotations",
        ).results;
        published = true;
        yield records
          .filter((record) => !selected || selected.has(record.path))
          .flatMap((record) =>
            annotationSourceEntry(record, annotationSourceFromResult(record), options.sourceIds),
          );
      }
      continue;
    } catch (error) {
      if (
        published ||
        !(error instanceof ConnectRepositoryError) ||
        error.code !== "query_budget_exceeded"
      ) {
        throw error;
      }
    }
    const pages = client.queryPages(input, paging);
    for await (const outcome of pages) {
      const records = outcomeValue<QueryPage | QueryMetadataPage>(
        outcome,
        "query annotations",
      ).results.filter((record) => !selected || selected.has(record.path));
      yield* discoverAnnotationSources(client, records, options);
    }
  }
}

async function* discoverAnnotationSources(
  client: ReaderConnectClient,
  records: readonly (QueryRecord | QueryMetadataRecord)[],
  options: AnnotationListOptions,
): AsyncGenerator<{ path: string; source: SourceId; reference: unknown }[]> {
  for (let offset = 0; offset < records.length;) {
    const batchSize = offset === 0 ? 16 : 64;
    const resolved = await mapConcurrent(
      records.slice(offset, offset + batchSize),
      readerConnectBulkConcurrency,
      async (record) => {
        options.signal?.throwIfAborted();
        const source = await annotationSourceAt(client, record.path, {
          ...(options.signal ? { signal: options.signal } : {}),
        });
        return annotationSourceEntry(record, source, options.sourceIds);
      },
    );
    yield resolved.flat();
    offset += batchSize;
  }
}

function annotationQueryScopes(paths?: ReadonlySet<string>): (string[] | null)[] {
  if (!paths) {
    return [null];
  }
  const listed = [...paths];
  const scopes: string[][] = [];
  for (let offset = 0; offset < listed.length; offset += 100) {
    scopes.push(listed.slice(offset, offset + 100));
  }
  return scopes;
}

function annotationSourceEntry(
  record: QueryRecord | QueryMetadataRecord,
  source: SourceId | undefined,
  sourceIds?: ReadonlySet<SourceId>,
): { path: string; source: SourceId; reference: unknown }[] {
  const fields =
    "file" in record ? (record.effectiveFrontmatter ?? record.frontmatter) : record.values;
  return stringField(fields?.["id"]) && source && (!sourceIds || sourceIds.has(source))
    ? [{ path: record.path, source, reference: fields?.["source"] }]
    : [];
}
