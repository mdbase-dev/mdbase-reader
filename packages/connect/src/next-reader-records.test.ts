import { connect, MdbaseError, toValue, type MdbaseClient, type wire } from "@mdbase-dev/sdk";
import { MemoryReplica } from "@mdbase-dev/sdk/testing";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { annotationContract, sourceContract } from "./contracts.js";
import { NextReaderRecords, type NextReaderRecord } from "./next-reader-records.js";

const clients: MdbaseClient[] = [];
const digests = { source: `sha256:${"a".repeat(64)}`, annotation: `sha256:${"b".repeat(64)}` };
const signal = (): AbortSignal => new AbortController().signal;

interface Fixture {
  replica: MemoryReplica;
  source: ReturnType<MemoryReplica["seed"]>;
  annotation: ReturnType<MemoryReplica["seed"]>;
  client: MdbaseClient;
  catalog: wire.DescribeResult;
  describe: MockInstance<MdbaseClient["describe"]>;
  records: NextReaderRecords;
}

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.close();
  }
  vi.restoreAllMocks();
});

async function fixture(): Promise<Fixture> {
  const replica = new MemoryReplica();
  const source = replica.seed({
    path: "library/paper.md",
    types: ["bibliography-item"],
    frontmatter: {
      work_id: "paper-1",
      caption: "A paper",
      medium: "article",
      captured: "2026-10-10T10:00:00Z",
      citation: toValue({ title: "A paper" }),
    },
    body: "User-authored literature note\n",
  });
  const annotation = replica.seed({
    path: "marks/highlight.md",
    types: ["margin-mark"],
    frontmatter: {
      mark_id: "highlight-1",
      for_work: "paper-1",
      mark_kind: "highlight",
      made_at: "2026-10-10T11:00:00Z",
    },
    body: "A quotation and comment\n",
  });
  replica.seed({
    path: "unrelated.md",
    types: ["note"],
    frontmatter: { id: "not-a-source", title: "Not admitted" },
  });
  const client = await connect({
    connector: replica.connector(),
    app: { name: "reader-data-test", version: "test" },
    reconnect: false,
  });
  clients.push(client);
  // Synthetic exact contract/type metadata over actual SDK record frames. This
  // does not qualify Reader's native manifest/parser/runtime or sign-in setup.
  const catalog: wire.DescribeResult = {
    specVersion: "0.3.0",
    settings: new Map(),
    inclusion: { include: [] },
    issues: [],
    contracts: [
      {
        ...sourceContract,
        digest: digests.source,
        path: "_contracts/source.md",
        contractType: "record",
        implementedBy: ["bibliography-item"],
      },
      {
        ...annotationContract,
        digest: digests.annotation,
        path: "_contracts/annotation.md",
        contractType: "record",
        implementedBy: ["margin-mark"],
      },
    ],
    types: [
      {
        name: "bibliography-item",
        path: "_types/bibliography-item.md",
        implements: [
          {
            contract: sourceContract.id,
            version: sourceContract.version,
            fields: new Map(
              Object.entries({
                id: "work_id",
                title: "caption",
                kind: "medium",
                saved_at: "captured",
                csl: "citation",
              }),
            ),
          },
        ],
      },
      {
        name: "margin-mark",
        path: "_types/margin-mark.md",
        implements: [
          {
            contract: annotationContract.id,
            version: annotationContract.version,
            fields: new Map(
              Object.entries({
                id: "mark_id",
                source: "for_work",
                annotation_type: "mark_kind",
                created_at: "made_at",
              }),
            ),
          },
        ],
      },
    ],
  };
  const describe = vi.spyOn(client, "describe").mockResolvedValue(catalog);
  return {
    replica,
    source,
    annotation,
    client,
    catalog,
    describe,
    records: new NextReaderRecords(client, digests),
  };
}

async function collect(
  pages: AsyncIterable<readonly NextReaderRecord[]>,
): Promise<NextReaderRecord[]> {
  const records: NextReaderRecord[] = [];
  for await (const page of pages) {
    records.push(...page);
  }
  return records;
}

describe("NextReaderRecords (SDK stand-in, not native/LAB acceptance)", () => {
  it("queries only admitted provider names and keeps native maps/state/identity", async () => {
    const f = await fixture();
    const query = vi.spyOn(f.client, "query");
    const get = vi.spyOn(f.client, "get");
    const sources = await collect(f.records.sources(signal()));
    expect(sources).toHaveLength(1);
    expect(sources[0]?.record.id).toBe(f.source.id);
    expect(sources[0]?.providerType).toBe("bibliography-item");
    expect(sources[0]?.fields.get("title")).toBe("A paper");
    expect(sources[0]?.fields.get("csl")).toBeInstanceOf(Map);
    expect(sources[0]?.record.frontmatter.has("caption")).toBe(true);
    expect(sources[0]?.record.body).toBeUndefined();
    expect(sources[0]?.record.document).toBeUndefined();
    expect(sources[0]?.record.state.state).toBe("confirmed");
    expect(query).toHaveBeenCalledWith(
      { types: ["bibliography-item"], limit: 1000 },
      { effective: true },
      expect.any(AbortSignal),
    );
    expect(get).not.toHaveBeenCalled();
    const annotations = await collect(f.records.annotations(signal()));
    expect(annotations[0]?.record.id).toBe(f.annotation.id);
    expect(annotations[0]?.fields.get("source")).toBe("paper-1");
    expect(annotations[0]?.fields.get("annotation_type")).toBe("highlight");
  });

  it.each(["source", "annotation"] as const)(
    "reads the genuine complete %s source without reconstructing it",
    async (domain) => {
      const f = await fixture();
      const id = domain === "source" ? f.source.id : f.annotation.id;
      const expected = await f.client.get(id, { body: true, document: true, effective: true });
      vi.spyOn(f.client, "get").mockResolvedValue(expected);
      const result =
        domain === "source"
          ? await f.records.getSource(id, signal())
          : await f.records.getAnnotation(id, signal());
      expect(result.record).toBe(expected);
      expect(result.record.body).toContain(domain === "source" ? "literature note" : "quotation");
      expect(result.record.document).toBe(expected.document);
    },
  );

  it.each(["missing", "version", "digest", "duplicate", "kind"])(
    "refuses %s contract metadata before querying",
    async (failure) => {
      const f = await fixture();
      const contract = f.catalog.contracts[0]!;
      if (failure === "missing") {
        f.catalog.contracts.shift();
      }
      if (failure === "version") {
        contract.version = "1.0.0-beta.2";
      }
      if (failure === "digest") {
        contract.digest = digests.annotation;
      }
      if (failure === "duplicate") {
        f.catalog.contracts.push({ ...contract });
      }
      if (failure === "kind") {
        contract.contractType = "file";
      }
      const query = vi.spyOn(f.client, "query");
      await expect(collect(f.records.sources(signal()))).rejects.toThrow(
        "qualified Reader source contract",
      );
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(["absent", "ambiguous", "required", "nested"])(
    "refuses %s provider bindings without a starter fallback",
    async (failure) => {
      const f = await fixture();
      const implementation = f.catalog.types[0]!.implements[0]!;
      if (failure === "absent") {
        f.catalog.types.shift();
      }
      if (failure === "ambiguous") {
        f.catalog.types[0]!.implements.push(implementation);
      }
      if (failure === "required") {
        implementation.fields.delete("id");
      }
      if (failure === "nested") {
        implementation.fields.set("title", "bibliography.title");
      }
      const query = vi.spyOn(f.client, "query");
      await expect(collect(f.records.sources(signal()))).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("requires explicit native semantic digest pins, not an unqualified default", async () => {
    const f = await fixture();
    expect(() => new NextReaderRecords(f.client, { ...digests, source: "not-a-digest" })).toThrow(
      "qualified native source",
    );
    const mutable = { ...digests };
    const records = new NextReaderRecords(f.client, mutable);
    mutable.source = digests.annotation;
    expect(await collect(records.sources(signal()))).toHaveLength(1);
  });
});

describe("NextReaderRecords full source (SDK stand-in, not native/LAB acceptance)", () => {
  it.each(["body", "document", "revision"])(
    "refuses missing or mismatched %s rather than synthesizing source",
    async (failure) => {
      const f = await fixture();
      const record = await f.client.get(f.source.id, {
        body: true,
        document: true,
        effective: true,
      });
      if (failure === "body") {
        delete record.body;
      }
      if (failure === "document") {
        delete record.document;
      }
      if (failure === "revision") {
        record.revision = digests.annotation;
      }
      vi.spyOn(f.client, "get").mockResolvedValue(record);
      await expect(f.records.getSource(f.source.id, signal())).rejects.toThrow(
        "actual complete revision-consistent source",
      );
    },
  );

  it("retains native pending/protected state without calling it saved or resubmitting", async () => {
    const f = await fixture();
    const record = await f.client.get(f.source.id, { body: true, document: true, effective: true });
    record.state = {
      ...record.state,
      state: "pending",
      unresolved: 1,
      hold: { id: crypto.randomUUID(), reason: "conflict" },
    };
    vi.spyOn(f.client, "get").mockResolvedValue(record);
    const submit = vi.spyOn(f.client, "submit");
    expect((await f.records.getSource(record.id, signal())).record.state).toBe(record.state);
    expect(submit).not.toHaveBeenCalled();
  });

  it("uses effective fields but leaves the genuine record unchanged", async () => {
    const f = await fixture();
    const record = await f.client.get(f.source.id, { body: true, document: true, effective: true });
    record.effective = new Map(record.frontmatter).set("caption", "Effective title");
    vi.spyOn(f.client, "get").mockResolvedValue(record);
    const projected = await f.records.getSource(record.id, signal());
    expect(projected.fields.get("title")).toBe("Effective title");
    expect(projected.record.frontmatter.get("caption")).toBe("A paper");
    expect(projected.record).toBe(record);
  });

  it("captures a mutable caller path before catalog I/O", async () => {
    const f = await fixture();
    const selected = { path: f.source.path };
    f.describe.mockImplementation(() => {
      selected.path = f.annotation.path;
      return Promise.resolve(f.catalog);
    });
    const get = vi.spyOn(f.client, "get");
    expect((await f.records.getSource(selected, signal())).record.id).toBe(f.source.id);
    expect(get).toHaveBeenCalledWith(
      { path: f.source.path },
      { body: true, document: true, effective: true },
      expect.any(AbortSignal),
    );
  });
});

describe("NextReaderRecords identity/provider safety (SDK stand-in)", () => {
  it("refuses an SDK readback that switches the selected UUID", async () => {
    const f = await fixture();
    const record = await f.client.get(f.source.id, { body: true, document: true, effective: true });
    vi.spyOn(f.client, "get").mockResolvedValue({ ...record, id: f.annotation.id });
    await expect(f.records.getSource(f.source.id, signal())).rejects.toThrow(
      "selected native identity",
    );
  });

  it("refuses records outside or ambiguous across admitted providers", async () => {
    const f = await fixture();
    const record = await f.client.get(f.source.id, { body: true, document: true, effective: true });
    const get = vi.spyOn(f.client, "get");
    get.mockResolvedValue({ ...record, types: ["reader-source"] });
    await expect(f.records.getSource(record.id, signal())).rejects.toThrow(
      "unique admitted provider",
    );
    f.catalog.types.push({ ...f.catalog.types[0]!, name: "alternate-provider" });
    get.mockResolvedValue({ ...record, types: ["bibliography-item", "alternate-provider"] });
    await expect(f.records.getSource(record.id, signal())).rejects.toThrow(
      "unique admitted provider",
    );
  });

  it("refuses bindings changed during a source read", async () => {
    const f = await fixture();
    const get = f.client.get.bind(f.client);
    vi.spyOn(f.client, "get").mockImplementation(async (...args) => {
      const record = await get(...args);
      f.catalog.types[0]!.implements[0]!.fields.set("title", "other_caption");
      return record;
    });
    await expect(f.records.getSource(f.source.id, signal())).rejects.toThrow("bindings changed");
  });

  it("refuses records missing required role values", async () => {
    const f = await fixture();
    const record = await f.client.get(f.source.id, { body: true, document: true, effective: true });
    record.frontmatter.delete("work_id");
    record.effective?.delete("work_id");
    vi.spyOn(f.client, "get").mockResolvedValue(record);
    await expect(f.records.getSource(record.id, signal())).rejects.toThrow(
      "lacks required contract fields",
    );
  });
});

describe("NextReaderRecords pagination/lifetime (SDK stand-in)", () => {
  it.each(["incomplete", "duplicate", "cut", "bindings"])(
    "refuses %s metadata snapshots",
    async (failure) => {
      const f = await fixture();
      vi.spyOn(f.client, "pages").mockImplementation(async function* () {
        const record = await f.client.get(f.source.id, { effective: true });
        yield { records: [record], complete: failure !== "incomplete", asOf: 1 };
        if (failure === "bindings") {
          f.catalog.types[0]!.implements[0]!.fields.set("title", "other_caption");
        }
        yield {
          records: failure === "duplicate" ? [record] : [],
          complete: true,
          asOf: failure === "cut" ? 2 : 1,
        };
      });
      await expect(collect(f.records.sources(signal()))).rejects.toThrow();
    },
  );

  it("propagates cursor failure without restart or fabricated success", async () => {
    const f = await fixture();
    const problem = new MdbaseError({
      code: "invalid_request",
      recovery: "fix_request",
      reason: "cursor_stale",
      message: "Cursor changed",
    });
    const query = vi.spyOn(f.client, "query").mockRejectedValue(problem);
    await expect(collect(f.records.sources(signal()))).rejects.toBe(problem);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not publish a body after the caller aborts during I/O", async () => {
    const f = await fixture();
    const controller = new AbortController();
    const get = f.client.get.bind(f.client);
    vi.spyOn(f.client, "get").mockImplementation(async (...args) => {
      const record = await get(...args);
      controller.abort(new Error("Reader closed"));
      return record;
    });
    await expect(f.records.getSource(f.source.id, controller.signal)).rejects.toThrow(
      "Reader closed",
    );
  });

  // Clients' regression: cancellation at the public describe recheck's nested
  // promise boundary, not native parser/runtime or security qualification.
  it.each(["full-source", "metadata"] as const)(
    "does not publish %s after cancellation between recheck and delivery",
    async (mode) => {
      const f = await fixture();
      const controller = new AbortController();
      let calls = 0;
      f.describe.mockImplementation(() => {
        if (++calls === 2) {
          queueMicrotask(() =>
            queueMicrotask(() =>
              queueMicrotask(() => controller.abort(new Error("Reader closed after recheck"))),
            ),
          );
        }
        return Promise.resolve(f.catalog);
      });
      const result =
        mode === "full-source"
          ? f.records.getSource(f.source.id, controller.signal)
          : collect(f.records.sources(controller.signal));
      await expect(result).rejects.toThrow("Reader closed after recheck");
      expect(controller.signal.aborted).toBe(true);
    },
  );
});
