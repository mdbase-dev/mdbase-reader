import { connect, mdbaseError, toValue, type MdbaseClient } from "@mdbase-dev/sdk";
import { MemoryReplica } from "@mdbase-dev/sdk/testing";
import { annotationId, dateTime, mutationId, sourceId } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeReaderClient, type NativeReaderClient } from "./native/native-client.js";
import { nativeReaderCollection } from "./native/native-collection.js";
import { memoryConnection } from "./native/testing.js";
import { ReaderSettingsStore } from "./reader-settings.js";
import { outcomeValue, type ReaderConnectClient } from "./repository-client.js";
import { plan as plannedImport } from "./source-imports.fixtures.js";

const path = "_settings/dev.mdbase.reader.md";
const record = {
  app: "dev.mdbase.reader",
  scope: "collection",
  settings_version: 1,
  source_name_template: "{{ year }}/{{ title }}",
};

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) {
    close();
  }
});

async function native(): Promise<{ replica: MemoryReplica; client: NativeReaderClient }> {
  const replica = new MemoryReplica({ confirmDelayMs: 0 });
  const sdk: MdbaseClient = await connect({
    connector: replica.connector(),
    app: { name: "reader-native-test", version: "test" },
    reconnect: false,
  });
  closers.push(() => sdk.close());
  return { replica, client: nativeReaderClient(sdk, () => true) };
}

async function stored(client: ReaderConnectClient): Promise<Record<string, unknown>> {
  return outcomeValue(await client.read({ path }), "read settings").frontmatter;
}

describe("ReaderSettingsStore reads", () => {
  it("uses the defaults without a record, and never creates one on read", async () => {
    const { client } = await native();
    const create = vi.spyOn(client, "create");
    const store = new ReaderSettingsStore(client);

    const snapshot = await store.current();

    expect(snapshot.status).toBe("ready");
    expect(snapshot.frontmatter).toBeUndefined();
    expect(snapshot.settings.values).toEqual({
      source_name_template: "{{ title | slug }}",
      annotation_name_template: "{{ id }}",
      highlight_colors: ["yellow", "green", "blue", "pink", "purple"],
      highlight_meanings: {},
    });
    expect(await store.templates()).toEqual({
      source: "{{ title | slug }}",
      annotation: "{{ id }}",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("reads the record by path and keeps its revision", async () => {
    const { replica, client } = await native();
    replica.seed({ path, types: ["reader-settings"], frontmatter: record });
    const snapshot = await new ReaderSettingsStore(client).current();
    expect(snapshot.settings.values.source_name_template).toBe("{{ year }}/{{ title }}");
    expect(snapshot.settings.stored).toEqual({ source_name_template: "{{ year }}/{{ title }}" });
    expect(snapshot.revision).toBeTruthy();
  });

  it("defaults a template Knap cannot use, with a warning, without rewriting the record", async () => {
    const { replica, client } = await native();
    replica.seed({
      path,
      types: ["reader-settings"],
      frontmatter: {
        ...record,
        source_name_template: "{{ title | shout }}",
        annotation_name_template: 7,
      },
    });
    const update = vi.spyOn(client, "update");
    const snapshot = await new ReaderSettingsStore(client).current();

    expect(snapshot.settings.values).toEqual({
      source_name_template: "{{ title | slug }}",
      annotation_name_template: "{{ id }}",
      highlight_colors: ["yellow", "green", "blue", "pink", "purple"],
      highlight_meanings: {},
    });
    expect(snapshot.settings.warnings.map((warning) => warning.field)).toEqual([
      "annotation_name_template",
      "source_name_template",
    ]);
    expect(snapshot.settings.warnings[1]?.message).toMatch(/Unknown filter "shout"/u);
    expect(snapshot.settings.readOnly).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it("is read-only when a newer Reader wrote the record", async () => {
    const { replica, client } = await native();
    replica.seed({
      path,
      types: ["reader-settings"],
      frontmatter: { ...record, settings_version: 2 },
    });
    const store = new ReaderSettingsStore(client);
    expect((await store.current()).settings.readOnly).toMatch(/newer version/u);
    const saved = await store.save({ annotation_name_template: "{{ words }}" });
    expect(saved).toMatchObject({ ok: false, reason: "read_only" });
    expect((await stored(client))["annotation_name_template"]).toBeUndefined();
  });
});

describe("ReaderSettingsStore highlight colours", () => {
  it("offers all five colours in today's order, with no meanings, by default", async () => {
    const { client } = await native();
    expect(await new ReaderSettingsStore(client).highlightColors()).toEqual({
      colors: ["yellow", "green", "blue", "pink", "purple"],
      meanings: {},
      meaningsStored: false,
    });
  });

  it("reads the offered colours in order and the meanings, skipping what it does not know", async () => {
    const { replica, client } = await native();
    replica.seed({
      path,
      types: ["reader-settings"],
      frontmatter: {
        ...record,
        highlight_colors: toValue(["blue", "orange", "yellow", "blue"]),
        highlight_meanings: toValue({ blue: "  Term ", orange: "Nope", pink: "" }),
      },
    });
    const store = new ReaderSettingsStore(client);
    expect(await store.highlightColors()).toEqual({
      colors: ["blue", "yellow"],
      meanings: { blue: "Term" },
      meaningsStored: true,
    });
    expect(store.getSnapshot().settings.warnings).toEqual([]);
  });

  it("falls back with a warning when no colour can be offered, without rewriting", async () => {
    const { replica, client } = await native();
    replica.seed({
      path,
      types: ["reader-settings"],
      frontmatter: {
        ...record,
        highlight_colors: toValue(["orange"]),
        highlight_meanings: "Key idea",
      },
    });
    const update = vi.spyOn(client, "update");
    const store = new ReaderSettingsStore(client);
    expect((await store.highlightColors()).colors).toEqual([
      "yellow",
      "green",
      "blue",
      "pink",
      "purple",
    ]);
    expect(store.getSnapshot().settings.warnings.map((warning) => warning.field)).toEqual([
      "highlight_colors",
      "highlight_meanings",
    ]);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves colours and meanings as fields, keeping the templates and settings_version", async () => {
    const { replica, client } = await native();
    replica.seed({ path, types: ["reader-settings"], frontmatter: record });
    const store = new ReaderSettingsStore(client);
    await store.current();
    const saved = await store.save({
      highlight_colors: ["pink", "green"],
      highlight_meanings: { pink: "Question" },
    });
    expect(saved.ok).toBe(true);
    expect(await stored(client)).toEqual({
      ...record,
      highlight_colors: ["pink", "green"],
      highlight_meanings: { pink: "Question" },
    });
    expect(await store.highlightColors()).toMatchObject({ colors: ["pink", "green"] });
  });
});

describe("ReaderSettingsStore saves", () => {
  it("creates the record on the first save with the reserved fields", async () => {
    const { client } = await native();
    const store = new ReaderSettingsStore(client);
    const saved = await store.save({ annotation_name_template: "{{ words }}" });

    expect(saved.ok).toBe(true);
    const document = outcomeValue(await client.read({ path }), "read settings");
    expect(document.types).toEqual(["reader-settings"]);
    expect(document.frontmatter).toEqual({
      app: "dev.mdbase.reader",
      scope: "collection",
      settings_version: 1,
      annotation_name_template: "{{ words }}",
    });
    expect(store.getSnapshot().settings.values.annotation_name_template).toBe("{{ words }}");
  });

  it("patches only the changed field, keeping fields it does not know", async () => {
    const { replica, client } = await native();
    replica.seed({
      path,
      types: ["reader-settings"],
      frontmatter: { ...record, from_a_newer_reader: true },
    });
    const store = new ReaderSettingsStore(client);
    await store.current();
    const update = vi.spyOn(client, "update");

    expect((await store.save({ source_name_template: "{{ title }}" })).ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { source_name_template: "{{ title }}" } }),
    );
    expect(await stored(client)).toEqual({
      ...record,
      from_a_newer_reader: true,
      source_name_template: "{{ title }}",
    });

    // Back to the default: the field is removed rather than written out.
    expect((await store.save({ source_name_template: null })).ok).toBe(true);
    expect(await stored(client)).not.toHaveProperty("source_name_template");
  });

  it("updates the record another device created first", async () => {
    const { client } = await native();
    const here = new ReaderSettingsStore(client);
    await here.current();
    const there = new ReaderSettingsStore(client);
    expect((await there.save({ source_name_template: "{{ title }}" })).ok).toBe(true);

    expect((await here.save({ annotation_name_template: "{{ words }}" })).ok).toBe(true);
    expect(await stored(client)).toMatchObject({
      source_name_template: "{{ title }}",
      annotation_name_template: "{{ words }}",
    });
  });

  it("retries once past someone else's edit of another field", async () => {
    const { replica, client } = await native();
    replica.seed({ path, types: ["reader-settings"], frontmatter: record });
    const here = new ReaderSettingsStore(client);
    await here.current();
    const there = new ReaderSettingsStore(client);
    expect(await there.save({ source_name_template: "{{ title }}" })).toMatchObject({ ok: true });

    expect((await here.save({ annotation_name_template: "{{ words }}" })).ok).toBe(true);
    expect(await stored(client)).toMatchObject({
      source_name_template: "{{ title }}",
      annotation_name_template: "{{ words }}",
    });
  });

  it("reports a conflict when the same field changed on both sides, writing nothing", async () => {
    const { replica, client } = await native();
    replica.seed({ path, types: ["reader-settings"], frontmatter: record });
    const here = new ReaderSettingsStore(client);
    const base = await here.current();
    const there = new ReaderSettingsStore(client);
    await there.save({ source_name_template: "{{ title }}" });
    await here.reload();

    const saved = await here.save({ source_name_template: "{{ author }}" }, base);

    expect(saved).toMatchObject({
      ok: false,
      reason: "conflict",
      fields: ["source_name_template"],
    });
    expect((await stored(client))["source_name_template"]).toBe("{{ title }}");
  });

  it("is read-only once the collection refuses a save for lack of access", async () => {
    const { client } = await native();
    vi.spyOn(client, "create").mockResolvedValue({
      ok: false,
      problem: { code: "not_authorized", message: "Read-only grant", recovery: "none" },
    } as never);
    const store = new ReaderSettingsStore(client);
    const saved = await store.save({ source_name_template: "{{ title }}" });
    expect(saved).toMatchObject({ ok: false, reason: "read_only" });
    expect(store.getSnapshot().settings.readOnly).toMatch(/cannot change/u);
  });
});

describe("creates use the collection's templates", () => {
  it("names a new annotation by the annotation template", async () => {
    const memory = await memoryConnection();
    closers.push(memory.close);
    memory.replica.seed({
      path,
      types: ["reader-settings"],
      frontmatter: { ...record, annotation_name_template: "{{ type }} {{ words }}" },
    });
    const collection = nativeReaderCollection(memory.connection);
    closers.push(() => collection.dispose());

    const created = await collection.annotations.create(
      {
        id: annotationId("ann_0011223344556677"),
        collectionId: collection.collectionId,
        sourceId: sourceId("src_01"),
        source: "[[sources/attention|Attention]]",
        annotationType: "highlight",
        tags: [],
        body: "",
        createdAt: dateTime("2026-10-02T10:00:00.000Z"),
        target: { quote: { exact: "Attention is all you need" } },
      },
      mutationId("mut_annotation"),
    );

    expect(created.path).toBe("annotations/highlight attention-is-all-you-need.md");
  });

  it("names a new source note by the source template", async () => {
    const memory = await memoryConnection();
    closers.push(memory.close);
    memory.replica.seed({ path, types: ["reader-settings"], frontmatter: record });
    const collection = nativeReaderCollection(memory.connection);
    closers.push(() => collection.dispose());

    const created = await collection.sourceImports.commitFile({
      ...plannedImport(),
      collectionId: collection.collectionId,
      representations: [],
      metadata: { published: "2017-06-12" },
    });

    expect(created.path).toBe("sources/2017/Manuscript.md");
  });
});

describe("ReaderSettingsStore follows the change feed", () => {
  it("applies another device's edit live", async () => {
    const memory = await memoryConnection();
    closers.push(memory.close);
    const collection = nativeReaderCollection(memory.connection);
    closers.push(() => collection.dispose());
    const store = collection.settings;
    if (!store) {
      throw new Error("A native collection has settings.");
    }
    const changed = vi.fn();
    const stop = store.subscribe(changed);
    closers.push(stop);
    await store.current();

    memory.replica.seed({ path, types: ["reader-settings"], frontmatter: record });

    await vi.waitFor(() => {
      expect(store.getSnapshot().settings.values.source_name_template).toBe(
        "{{ year }}/{{ title }}",
      );
    });
    expect(changed).toHaveBeenCalled();
  });

  it("follows another device's highlight colours live", async () => {
    const memory = await memoryConnection();
    closers.push(memory.close);
    const collection = nativeReaderCollection(memory.connection);
    closers.push(() => collection.dispose());
    const store = collection.settings!;
    expect((await store.highlightColors()).colors).toHaveLength(5);

    memory.replica.seed({
      path,
      types: ["reader-settings"],
      frontmatter: { ...record, highlight_colors: toValue(["purple"]) },
    });

    await vi.waitFor(async () => {
      expect((await store.highlightColors()).colors).toEqual(["purple"]);
    });
  });

  it("follows the feed for names even when no screen is watching", async () => {
    const memory = await memoryConnection();
    closers.push(memory.close);
    const collection = nativeReaderCollection(memory.connection);
    closers.push(() => collection.dispose());
    const store = collection.settings!;
    expect((await store.templates()).source).toBe("{{ title | slug }}");

    memory.replica.seed({ path, types: ["reader-settings"], frontmatter: record });

    await vi.waitFor(async () => {
      expect((await store.templates()).source).toBe("{{ year }}/{{ title }}");
    });
  });

  it("saves again over another device's record when head refuses a pending first save", async () => {
    const replica = new MemoryReplica({ confirmDelayMs: null });
    const sdk = await connect({
      connector: replica.connector(),
      app: { name: "reader-native-test", version: "test" },
      reconnect: false,
    });
    closers.push(() => sdk.close());
    const client = nativeReaderClient(sdk, () => true, { receiptWaitMs: 20 });
    let mutation = "";
    const create = client.create.bind(client);
    vi.spyOn(client, "create").mockImplementation((input, options) =>
      create(input, {
        ...options,
        onReceipt: (receipt) => {
          mutation = receipt.mutationId;
          options?.onReceipt?.(receipt);
        },
      }),
    );
    const store = new ReaderSettingsStore(client, {
      watch: (watched, onChange) =>
        sdk.watchChanges(undefined, (batch) => {
          if (batch.reset || batch.changes.some((change) => change.path === watched)) {
            onChange();
          }
        }),
    });
    closers.push(() => store.dispose());

    // Saved on this device only; the log has not decided.
    expect((await store.save({ annotation_name_template: "{{ words }}" })).ok).toBe(true);

    // Another device created the record first, so head refuses ours.
    replica.reject(
      mutation,
      mdbaseError("conflict", `path ${path} is taken`, "path_taken").toProblem(),
    );
    replica.seed({ path, types: ["reader-settings"], frontmatter: record });
    replica.confirmAll();

    await vi.waitFor(async () => {
      replica.confirmAll();
      expect(await stored(client)).toMatchObject({
        source_name_template: "{{ year }}/{{ title }}",
        annotation_name_template: "{{ words }}",
      });
    });
  });
});
