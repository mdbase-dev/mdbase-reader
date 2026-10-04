import { connect, mdbaseError, toPlain, type MdbaseClient } from "@mdbase-dev/sdk";
import { MemoryReplica, type MemoryRecord } from "@mdbase-dev/sdk/testing";
import { collectionId, sourceId } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectContentSearchRepository } from "../content-search-repository.js";
import { sourceContract } from "../contracts.js";
import { ConnectRepositoryError, outcomeValue } from "../repository-client.js";
import { ConnectSourceRepository } from "../source-repository.js";

import { nextReaderClient } from "./client.js";
import { nextErrorOf, nextProblem, waitingForDeviceMessage } from "./errors.js";

import type { QueryPage } from "@mdbase-dev/connect";

/** Just enough of the expression language for Reader's own filters. */
function where(expression: string, record: MemoryRecord): boolean {
  const equals = /^(file\.path|id) == "([^"]*)"$/u.exec(expression);
  if (equals) {
    const value =
      equals[1] === "file.path" ? record.path : toPlain(record.frontmatter.get("id") ?? null);
    return value === equals[2];
  }
  const contains = /^file\.body\.lower\(\)\.contains\("([^"]*)"\)$/u.exec(expression);
  if (contains) {
    return record.body.toLowerCase().includes(contains[1] ?? "");
  }
  throw new Error(`unsupported test expression: ${expression}`);
}

const clients: MdbaseClient[] = [];

interface Opened {
  readonly replica: MemoryReplica;
  readonly db: MdbaseClient;
  readonly client: ReturnType<typeof nextReaderClient>;
}

async function open(options: ConstructorParameters<typeof MemoryReplica>[0] = {}): Promise<Opened> {
  const replica = new MemoryReplica({ confirmDelayMs: null, where, ...options });
  const db = await connect({
    app: { name: "mdbase-reader-test", version: "0" },
    connector: replica.connector(),
    reconnect: false,
  });
  clients.push(db);
  return { replica, db, client: nextReaderClient(db) };
}

function seedSource(replica: MemoryReplica, index: number, body = ""): MemoryRecord {
  return replica.seed({
    path: `sources/source-${String(index)}.md`,
    types: ["reader-source"],
    frontmatter: { id: `src-${String(index)}`, title: `Source ${String(index)}` },
    body,
  });
}

afterEach(() => {
  for (const db of clients.splice(0)) {
    db.close();
  }
});

describe("mdbase-next Reader client", () => {
  it("reads a record by path as a Connect record document", async () => {
    const { replica, client } = await open();
    seedSource(replica, 1, "Notes");

    const document = outcomeValue(
      await client.read({ path: "sources/source-1.md", includeDocument: true }),
      "read",
    );

    expect(document).toMatchObject({
      path: "sources/source-1.md",
      types: ["reader-source"],
      frontmatter: { id: "src-1", title: "Source 1" },
      effectiveFrontmatter: { id: "src-1", title: "Source 1" },
      body: "Notes",
      file: { path: "sources/source-1.md", name: "source-1.md", folder: "sources" },
    });
    expect(document.revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(document.document).toContain("Notes");
  });

  it("pages queries by cursor and keeps Reader's page sizes", async () => {
    const { replica, client } = await open();
    for (let index = 1; index <= 5; index += 1) {
      seedSource(replica, index);
    }

    const pages: QueryPage[] = [];
    for await (const outcome of client.queryPages(
      { contract: sourceContract, frontmatterMode: "effective" },
      { firstPageSize: 2, pageSize: 2 },
    )) {
      pages.push(outcomeValue(outcome, "query"));
    }

    expect(pages.map((page) => page.results.length)).toEqual([2, 2, 1]);
    expect(pages.map((page) => page.complete)).toEqual([false, false, true]);
    expect(pages.at(-1)).toMatchObject({ page: 2, offset: 4, loaded: 5 });
    expect(pages.flatMap((page) => page.results.map((row) => row.path))).toHaveLength(5);
  });

  it("emulates offset pages for Reader's library list", async () => {
    const { replica, client } = await open();
    for (let index = 1; index <= 5; index += 1) {
      seedSource(replica, index);
    }

    const page = outcomeValue(
      await client.query({ contract: sourceContract, limit: 2, offset: 2 }),
      "query",
    );

    expect(page.results.map((row) => row.path)).toEqual([
      "sources/source-3.md",
      "sources/source-4.md",
    ]);
    expect(page.meta?.hasMore).toBe(true);
  });
});

describe("mdbase-next Reader client writes", () => {
  it("returns created and updated records optimistically, then they confirm", async () => {
    const { replica, db, client } = await open();

    const created = outcomeValue(
      await client.create({
        path: "sources/new.md",
        contract: sourceContract,
        frontmatter: { id: "src-new", title: "New" },
        body: "Draft",
      }),
      "create",
    );
    expect(created).toMatchObject({
      path: "sources/new.md",
      types: ["reader-source"],
      body: "Draft",
    });
    expect((await db.get({ path: "sources/new.md" })).state.state).toBe("pending");

    const updated = outcomeValue(
      await client.update({ path: "sources/new.md", patch: { title: "Renamed" }, body: "Final" }),
      "update",
    );
    expect(updated).toMatchObject({ frontmatter: { title: "Renamed" }, body: "Final" });

    replica.confirmAll();
    await vi.waitFor(async () => {
      expect((await db.get({ path: "sources/new.md" })).state.state).toBe("confirmed");
    });
  });

  it("waits for confirmation when Reader asks for CAS", async () => {
    const { replica, client } = await open({ confirmDelayMs: 5 });
    seedSource(replica, 1, "Before");
    const current = outcomeValue(await client.read({ path: "sources/source-1.md" }), "read");

    const updated = outcomeValue(
      await client.update({
        path: current.path,
        ifRevision: current.revision,
        patch: {},
        body: "After",
      }),
      "update",
    );

    expect(updated.body).toBe("After");
    expect(replica.allRecords[0]?.pending).toBe(false);
  });

  it("maps a CAS refusal to Reader's concurrent-modification problem", async () => {
    const { replica, client } = await open();
    seedSource(replica, 1, "Before");
    const stale = outcomeValue(await client.read({ path: "sources/source-1.md" }), "read");
    outcomeValue(
      await client.update({ path: stale.path, patch: { title: "Elsewhere" } }),
      "concurrent edit",
    );

    const outcome = await client.update({
      path: stale.path,
      ifRevision: stale.revision,
      patch: {},
      body: "Mine",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.problem.code).toBe("concurrent_modification");
    expect(nextErrorOf(outcome.problem)).toMatchObject({ code: "conflict", reason: "revision" });
    expect(() => outcomeValue(outcome, "save source note")).toThrow(ConnectRepositoryError);
  });

  it("serves Reader's source repository and content search unchanged", async () => {
    const { replica, client } = await open();
    seedSource(replica, 1, "An essay about Marginalia.");
    seedSource(replica, 2, "Unrelated");
    const collection = collectionId(replica.collection);

    const source = await new ConnectSourceRepository(client).get(collection, sourceId("src-1"));
    const matches = await new ConnectContentSearchRepository(client).search(
      collection,
      "marginalia",
    );

    expect(source).toMatchObject({ id: "src-1", title: "Source 1", path: "sources/source-1.md" });
    expect(matches.map((match) => match.sourceId)).toEqual(["src-1"]);
    expect(matches[0]?.passages?.[0]?.text).toContain("Marginalia");
  });

  it("deletes with progress and preflights with a dry run", async () => {
    const { replica, client } = await open();
    const record = seedSource(replica, 1);
    const revision = outcomeValue(await client.read({ path: record.path }), "read").revision;

    const preflight = outcomeValue(
      await client.preflightDelete({ path: record.path, ifRevision: revision }),
      "preflight",
    );
    expect(preflight).toEqual({
      path: record.path,
      deleted: false,
      dryRun: true,
      wouldDelete: true,
    });
    expect(replica.allRecords).toHaveLength(1);

    const progress = vi.fn();
    const deleted = outcomeValue(
      await client.deleteWithProgress({ path: record.path }, { onProgress: progress }),
      "delete",
    );
    expect(deleted).toEqual({ path: record.path, deleted: true });
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ state: "completed" }));
    const missing = await client.read({ path: record.path });
    expect(missing.ok ? null : missing.problem.code).toBe("file_not_found");
  });
});

describe("mdbase-next problems", () => {
  it("shows a waiting state when none of the person's devices is online", () => {
    const problem = nextProblem(mdbaseError("unavailable", "no device online", "no_device_online"));

    expect(problem.code).toBe("connector_offline");
    expect(problem.message).toBe(waitingForDeviceMessage);
  });

  it.each([
    ["invalid_request", "invalid_request"],
    ["not_found", "file_not_found"],
    ["unauthenticated", "authorization_expired"],
    ["forbidden", "insufficient_access"],
    ["rate_limited", "rate_limited"],
    ["upgrade_required", "connector_upgrade_required"],
    ["outcome_unknown", "operation_outcome_unknown"],
    ["cancelled", "operation_cancelled"],
    ["internal", "operation_failed"],
  ] as const)("maps %s to %s", (code, expected) => {
    expect(nextProblem(mdbaseError(code, "detail")).code).toBe(expected);
  });
});
