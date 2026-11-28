import {
  annotationSourceValue,
  resolveAnnotationSources,
  stringField,
} from "./annotation-source.js";
import { completeReaderPages } from "./repository-client.js";

import type { MdbaseClient, RecordView } from "@mdbase-dev/sdk";
import type { AnnotationListOptions, SourceId } from "@mdbase-reader/core";

/**
 * Every annotation with its resolved source, a page at a time. Annotations are listed with a
 * query that follows no link, then each page's `source` links go to the link resolver: a
 * link-following query is bounded by collection size and refuses past 1000 records.
 */
export async function* annotationSourcePages(
  client: MdbaseClient,
  options: AnnotationListOptions,
): AsyncGenerator<
  { readonly path: string; readonly source: SourceId; readonly reference: unknown }[]
> {
  if (options.paths?.size === 0) {
    return;
  }
  // Source IDs by record path, shared by every page's link resolution.
  const ids = new Map<string, SourceId | undefined>();
  const signal = options.signal ? { signal: options.signal } : {};
  for (const scope of annotationQueryScopes(options.paths)) {
    const selected = scope ? new Set(scope) : null;
    options.signal?.throwIfAborted();
    const query = {
      types: ["reader-annotation"],
      ...(scope
        ? { where: scope.map((path) => `file.path == ${JSON.stringify(path)}`).join(" || ") }
        : {}),
    };
    for await (const page of completeReaderPages(client, query, {
      ...signal,
      include: { effective: true },
    })) {
      const records = page.records.filter((record) => !selected || selected.has(record.path));
      const sources = await resolveAnnotationSources(
        client,
        records.map((record) => ({ path: record.path, reference: annotationSourceValue(record) })),
        signal,
        ids,
      );
      options.signal?.throwIfAborted();
      yield records.flatMap((record) =>
        annotationSourceEntry(record, sources.get(record.path), options.sourceIds),
      );
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
  record: RecordView,
  source: SourceId | undefined,
  sourceIds?: ReadonlySet<SourceId>,
): { path: string; source: SourceId; reference: unknown }[] {
  const fields = record.effective ?? record.frontmatter;
  return stringField(fields["id"]) && source && (!sourceIds || sourceIds.has(source))
    ? [{ path: record.path, source, reference: fields["source"] }]
    : [];
}
