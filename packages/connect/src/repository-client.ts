import { describeError, isMdbaseError, MdbaseError } from "@mdbase-dev/sdk";

import { validationIssueSummary, type ConnectValidationIssue } from "./validation-issues.js";

import type {
  wire,
  JsonObject,
  Query,
  RecordReadOptions,
  PagesOptions,
  QueryResult,
  MdbaseClient,
  Problem,
  RecordRef,
  RecordView,
  Settlement,
  UpdateInput,
  Write,
} from "@mdbase-dev/sdk";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

export const readerConnectBulkConcurrency = 4;

/** Reader borrows the SDK client; its application owns that client's lifetime. */

export class ConnectRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string,
    detail?: string,
    readonly problem?: Problem,
    readonly issues: readonly ConnectValidationIssue[] = [],
  ) {
    const description = problem ? describeError(new MdbaseError(problem)) : null;
    const summary = validationIssueSummary(issues);
    super(`${description?.message ?? detail ?? code}${summary ? `: ${summary}` : ""}`);
    this.name = "ConnectRepositoryError";
  }
}

/** A settled write is read through the SDK; an uncertain result retains its original identity. */
export async function settledRecord(
  client: MdbaseClient,
  write: Write | Promise<Write> | string,
  record?: RecordRef,
  signal?: AbortSignal,
): Promise<RecordView> {
  const settled = await client.settle(write, {
    read: {
      ...(record ? { record } : {}),
      include: { effective: true, body: true, document: true },
    },
    ...(signal ? { signal } : {}),
  });
  requireSaved(settled);
  if (!settled.record) {
    throw new Error("The saved record no longer exists.");
  }
  return settled.record;
}

export function requireSaved(
  settled: Settlement,
): asserts settled is Extract<Settlement, { outcome: "confirmed" | "saved_on_device" }> {
  if (settled.outcome === "rejected" || settled.outcome === "unknown") {
    throw new MdbaseError(
      settled.problem,
      settled.mutationId ? { mutationId: settled.mutationId } : {},
    );
  }
  if (settled.outcome === "conflicted") {
    throw new MdbaseError(
      {
        code: "conflict",
        recovery: "resolve_conflict",
        message: "This change conflicts with another edit. Resolve it before continuing.",
      },
      { mutationId: settled.mutationId },
    );
  }
}

/** Edits use the genuine native view and its revision, including the SDK's field observations. */
export async function updateRecord(
  client: MdbaseClient,
  ref: RecordRef,
  changes: UpdateInput,
  signal?: AbortSignal,
): Promise<RecordView> {
  const options = {
    include: { effective: true, body: true, document: true },
    ...(signal ? { signal } : {}),
  };
  const base =
    typeof ref === "object" && "frontmatter" in ref ? ref : await client.get(ref, options);
  return settledRecord(
    client,
    client.update(base, changes, signal ? { signal } : {}),
    base,
    signal,
  );
}

export async function mapConcurrent<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  operation: (value: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrent repository work requires at least one worker.");
  }
  const results = new Array<Output>(values.length);
  let nextIndex = 0;
  let stopped = false;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (!stopped && nextIndex < values.length) {
        const index = nextIndex++;
        try {
          results[index] = await operation(values[index] as Input, index);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    }),
  );
  return results;
}

export async function recordPathById(
  client: MdbaseClient,
  id: string,
  options: ReaderRequestOptions = {},
): Promise<string | null> {
  for await (const page of client.pages(
    { where: `id == ${JSON.stringify(id)}`, limit: 50 },
    { include: { effective: true }, ...(options.signal ? { signal: options.signal } : {}) },
  )) {
    for (const record of page.records) {
      if ((record.effective ?? record.frontmatter)["id"] === id) {
        return record.path;
      }
    }
  }
  return null;
}

export async function findRecord(
  client: MdbaseClient,
  ref: RecordRef,
  options: ReaderRequestOptions = {},
): Promise<RecordView | null> {
  try {
    return await client.get(ref, {
      include: { effective: true, body: true, document: true },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (isMdbaseError(error, "not_found")) {
      return null;
    }
    throw error;
  }
}

export async function preflightDeleteRecord(
  client: MdbaseClient,
  ref: RecordRef,
  revision: string,
): Promise<wire.Preflight> {
  const record = await recordForRevision(client, ref, revision);
  return client.preflightDelete(record);
}

export async function deleteRecord(
  client: MdbaseClient,
  ref: RecordRef,
  revision: string,
  shown: wire.Preflight,
): Promise<void> {
  const record = await recordForRevision(client, ref, revision);
  const fresh = await client.preflightDelete(record);
  const confirmed = new Set(shown.broken.map(({ path }) => path));
  if (fresh.broken.some(({ path }) => !confirmed.has(path))) {
    throw new MdbaseError({
      code: "conflict",
      reason: "preflight_changed",
      recovery: "refresh",
      message: "More links would break than were confirmed. Review the deletion again.",
    });
  }
  requireSaved(await client.settle(client.delete(record, { ifRevision: revision })));
}

async function recordForRevision(
  client: MdbaseClient,
  ref: RecordRef,
  revision: string,
): Promise<RecordView> {
  const record = await client.get(ref);
  if (record.revision !== revision) {
    throw new MdbaseError({
      code: "conflict",
      reason: "revision_mismatch",
      recovery: "refresh",
      message: "This record changed after it was read.",
    });
  }
  return record;
}

/** Reader field editors use null for a reset; the native API names removals in unset. */
export function frontmatterChanges(
  fields: Readonly<Record<string, unknown>>,
): Pick<UpdateInput, "patch" | "unset"> {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  const unset = entries.filter(([, value]) => value === null).map(([key]) => key);
  return {
    patch: Object.fromEntries(entries.filter(([, value]) => value !== null)) as JsonObject,
    ...(unset.length ? { unset } : {}),
  };
}

/** A partial evaluator result cannot become Reader's complete library or annotation index. */
export async function* completeReaderPages(
  client: MdbaseClient,
  query: Query,
  options: RecordReadOptions & PagesOptions = {},
): AsyncGenerator<QueryResult> {
  for await (const page of client.pages(query, {
    ...options,
    include: { effective: true, ...options.include },
  })) {
    requireCompleteQuery(page);
    yield page;
  }
}

export function requireCompleteQuery(page: QueryResult): void {
  if (!page.complete) {
    throw new MdbaseError({
      code: "unavailable",
      reason: "query_incomplete",
      recovery: "retry",
      message: "The collection did not provide a complete query.",
    });
  }
}
