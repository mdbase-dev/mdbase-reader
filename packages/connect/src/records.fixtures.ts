import {
  isMdbaseError,
  Write,
  uuidv7,
  type MdbaseClient,
  type RecordRef,
  type FileView,
  type QueryResult,
  type RecordView,
  type JsonObject,
} from "@mdbase-dev/sdk";
import { vi } from "vitest";

export function testRecord(
  fields: Omit<Partial<RecordView>, "frontmatter" | "effective"> & {
    path: string;
    frontmatter?: Readonly<Record<string, unknown>>;
    effective?: Readonly<Record<string, unknown>> | undefined;
  },
): RecordView {
  const frontmatter = (fields.frontmatter ?? fields.effective ?? {}) as JsonObject;
  return {
    id: uuidv7(),
    revision: "test-revision",
    types: [],
    state: { state: "confirmed", confirmedSeq: 1 },
    ...fields,
    frontmatter,
    effective: (fields.effective ?? frontmatter) as JsonObject,
  };
}
export function testQuery(fields: Partial<QueryResult> & { records: RecordView[] }): QueryResult {
  return { complete: true, asOf: 1, ...fields };
}
export function testFile(fields: Partial<FileView> & { path: string }): FileView {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    digest: "sha256:test",
    size: 0,
    media: "other",
    state: "materialized",
    confirmedSeq: 1,
    ...fields,
  };
}

/** Public SDK values at the unit-test boundary; transport/receipt tests use MemoryReplica. */
export function testWrite(record: RecordView): Write {
  return new Write({
    mutation: uuidv7(),
    state: "confirmed",
    status: "applied",
    records: [record],
  });
}

/**
 * Stands in for the replica's link methods over `records`: `resolve(link, from)` is the record
 * path mdbase resolves a link written in the note at `from` to, or null when it reaches none.
 * Backlinks are the records with a frontmatter field whose link resolves to the target.
 */
export function linkIndex(
  records: readonly RecordView[] | (() => readonly RecordView[]),
  resolve: (link: string, from: string) => string | null,
): Pick<MdbaseClient, "backlinks" | "resolveLinks"> {
  const all = (): readonly RecordView[] => (typeof records === "function" ? records() : records);
  const occurrence = (value: string): string =>
    /^!?\[\[.+\]\]$|^!?\[.*\]\(.+\)$/u.test(value) ? value : `[[${value}]]`;
  return {
    resolveLinks: vi.fn<MdbaseClient["resolveLinks"]>((from, links) =>
      Promise.resolve({
        resolutions: links.map((link) => {
          const path = resolve(link, from);
          return path ? { kind: "record", path } : { kind: "not_found" };
        }),
        complete: true,
        asOf: 1,
      }),
    ),
    backlinks: vi.fn<MdbaseClient["backlinks"]>((target) => {
      const path = (target as { readonly path: string }).path;
      return Promise.resolve({
        backlinks: all().flatMap((record) => {
          const links = Object.entries(record.effective ?? record.frontmatter).flatMap(
            ([field, value]) =>
              typeof value === "string" && resolve(occurrence(value), record.path) === path
                ? [
                    {
                      raw: value,
                      embed: false,
                      resolution: { kind: "record" as const, path },
                      field,
                    },
                  ]
                : [],
          );
          return links.length > 0 ? [{ record, links }] : [];
        }),
        complete: true,
        asOf: 1,
      });
    }),
  };
}

export function mockSdk(overrides: Record<string, unknown> = {}): MdbaseClient {
  const client = {
    get: vi.fn((ref: RecordRef) =>
      Promise.resolve(testRecord({ path: typeof ref === "string" ? ref : ref.path })),
    ),
    // No link resolves unless a test says how (`linkIndex`).
    ...linkIndex([], () => null),
    ...overrides,
  } as unknown as MdbaseClient;
  if (!("find" in overrides)) {
    client.find = vi.fn<MdbaseClient["find"]>(async (ref, options) => {
      try {
        return await client.get(ref, options);
      } catch (error) {
        if (isMdbaseError(error, "not_found")) {
          return null;
        }
        throw error;
      }
    });
  }
  if (!("settle" in overrides)) {
    client.settle = vi.fn<MdbaseClient["settle"]>(async (input) => {
      if (typeof input === "string") {
        throw new Error("This unit fixture has no recorded mutation.");
      }
      let write;
      try {
        write = await input;
      } catch (error) {
        if (!isMdbaseError(error) || error.code === "cancelled") {
          throw error;
        }
        if (error.mutationId) {
          return { outcome: "unknown", mutationId: error.mutationId, problem: error.toProblem() };
        }
        return { outcome: "rejected", problem: error.toProblem() };
      }
      const receipt = write.receipt;
      if (receipt.state === "rejected") {
        return {
          outcome: "rejected",
          mutationId: write.mutationId,
          receipt,
          problem: receipt.problem ?? {
            code: "conflict",
            message: "Rejected fixture",
            recovery: "refresh",
          },
        };
      }
      if (receipt.state === "unknown") {
        return {
          outcome: "unknown",
          mutationId: write.mutationId,
          receipt,
          problem: receipt.problem ?? {
            code: "conflict",
            message: "Rejected fixture",
            recovery: "refresh",
          },
        };
      }
      return {
        outcome: receipt.state === "pending" ? "saved_on_device" : "confirmed",
        mutationId: write.mutationId,
        receipt,
        record: write.records[0] ?? null,
      };
    });
  }
  return client;
}
