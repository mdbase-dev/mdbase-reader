import { annotationSourceAt, stringField } from "./annotation-source.js";
import { mapConcurrent, outcomeValue, readerConnectBulkConcurrency } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  QueryRecord,
  QueryMetadataRecord,
  QueryPage,
  QueryMetadataPage,
} from "@mdbase-dev/connect";
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
    const pages = client.queryPages(input, paging);
    for await (const outcome of pages) {
      const records = outcomeValue<QueryPage | QueryMetadataPage>(
        outcome,
        "query annotations",
      ).results.filter((record) => !selected || selected.has(record.path));
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
            return annotationSourceEntry(record, source);
          },
        );
        yield resolved
          .flat()
          .filter((entry) => !options.sourceIds || options.sourceIds.has(entry.source));
        offset += batchSize;
      }
    }
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
): { path: string; source: SourceId; reference: unknown }[] {
  const fields =
    "file" in record ? (record.effectiveFrontmatter ?? record.frontmatter) : record.values;
  return stringField(fields?.["id"]) && source
    ? [{ path: record.path, source, reference: fields?.["source"] }]
    : [];
}
