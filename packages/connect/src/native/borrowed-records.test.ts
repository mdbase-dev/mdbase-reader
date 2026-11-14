import { afterEach, expect, it, vi } from "vitest";

import { borrowedRecords } from "./borrowed-records.js";
import { memoryConnection } from "./testing.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) {
    close();
  }
  vi.restoreAllMocks();
});

it("preserves native record values and leaves the borrowed client open", async () => {
  const memory = await memoryConnection();
  cleanup.push(memory.close);
  memory.replica.seed({
    path: "note.md",
    frontmatter: { id: "note", labels: ["plain"] },
    body: "Body",
  });
  const owner = memory.connection.records;
  const lifetime = new AbortController();
  const borrowed = borrowedRecords(owner, memory.connection.isCurrent, lifetime.signal);
  const record = await borrowed.get(
    { path: "note.md" },
    { include: { body: true, effective: true } },
  );
  expect(record).toMatchObject({
    body: "Body",
    frontmatter: { labels: ["plain"] },
    revision: expect.any(String),
  });
  const close = vi.spyOn(owner, "close");
  lifetime.abort();
  await expect(borrowed.get({ path: "note.md" })).rejects.toBeDefined();
  expect(close).not.toHaveBeenCalled();
});

it("rejects a late read and new writes after the collection scope changes", async () => {
  const memory = await memoryConnection();
  cleanup.push(memory.close);
  memory.replica.seed({ path: "note.md", body: "Body" });
  const owner = memory.connection.records;
  const record = await owner.get({ path: "note.md" });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(owner, "get").mockImplementationOnce(async () => {
    await held;
    return record;
  });
  const borrowed = borrowedRecords(
    owner,
    memory.connection.isCurrent,
    new AbortController().signal,
  );
  const reading = borrowed.get({ path: "note.md" });
  const rejected = expect(reading).rejects.toMatchObject({ code: "cancelled" });
  memory.setCurrent(false);
  release();
  await rejected;
  const create = vi.spyOn(owner, "create");
  await expect(borrowed.create({ path: "other.md", body: "No" })).rejects.toMatchObject({
    code: "cancelled",
  });
  expect(create).not.toHaveBeenCalled();
});
