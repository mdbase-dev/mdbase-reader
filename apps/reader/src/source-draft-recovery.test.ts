import { ConnectRepositoryError } from "@mdbase-reader/connect";
import { collectionId, recordRevision, sourceId, type Source } from "@mdbase-reader/core";
import { afterEach, expect, it, vi } from "vitest";

import { flushLocalDraftCheckpoints } from "./local-draft-checkpoint.js";
import { SourceDraftSession } from "./source-draft-session.js";

import type { DraftStorage } from "./source-draft-storage.js";

const source: Source = {
  collectionId: collectionId("test"),
  id: sourceId("note"),
  path: "note.md",
  title: "Test",
  creators: [],
  tags: [],
  documents: [],
  frontmatter: {},
  body: "Original",
  recordRevision: recordRevision("1"),
};
const storage: DraftStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};
const lost = new ConnectRepositoryError(
  "update source note",
  "operation_outcome_unknown",
  "Response lost",
  {
    code: "operation_outcome_unknown",
    message: "Response lost",
    category: "conflict",
    recovery: "resolve_outcome",
    operation_outcome: "unknown",
    details: { request_id: "lost" },
  } as never,
);

afterEach(() => {
  flushLocalDraftCheckpoints();
  vi.useRealTimers();
});

it("recovers an interrupted source write exactly instead of writing again (DATA_MODEL §23)", async () => {
  vi.useFakeTimers();
  let remote = source;
  const accepted = { ...source, body: "First", recordRevision: recordRevision("2") };
  const persist = vi.fn((_base: Source, body: string) => {
    remote = { ...remote, body, recordRevision: recordRevision("3") };
    return Promise.resolve(remote);
  });
  persist.mockImplementationOnce(() => {
    remote = accepted; // The write was applied; only its response was lost.
    return Promise.reject(lost);
  });
  const recover = vi.fn(() => Promise.resolve(accepted));
  const publish = vi.fn();
  const session = new SourceDraftSession(
    source,
    storage,
    persist,
    () => Promise.resolve(remote),
    publish,
    { recover, isPending: () => true },
  );
  session.edit("First");
  await session.save();
  expect(session.getSnapshot()).toMatchObject({
    status: "error",
    error: expect.stringContaining("Response lost"),
  });
  session.edit("Second");
  await expect(session.flush()).resolves.toMatchObject({ recordRevision: "3" });
  expect(recover).toHaveBeenCalledExactlyOnceWith("lost");
  expect(persist).toHaveBeenCalledTimes(2);
  expect(persist).toHaveBeenLastCalledWith(accepted, "Second");
  expect(publish).toHaveBeenCalledWith(accepted);
}, 10_000);
