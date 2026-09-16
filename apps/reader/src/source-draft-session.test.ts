import { collectionId, sourceId, recordRevision, type Source } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SourceDraftSession } from "./source-draft-session.js";
import {
  readSourceDraft,
  sourceDraftKey,
  writeSourceDraft,
  type DraftStorage,
} from "./source-draft-storage.js";

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
function memory(): DraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
// Fixture return type retains the mock implementation signatures for deferred-save tests.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fixture(storage = memory()) {
  let remote = source;
  const persist = vi.fn((_base: Source, body: string) => {
    remote = { ...remote, body, recordRevision: recordRevision(`${remote.recordRevision}+1`) };
    return Promise.resolve(remote);
  });
  const refresh = vi.fn(() => Promise.resolve(remote));
  const session = new SourceDraftSession(source, storage, persist, refresh, vi.fn());
  return {
    session,
    storage,
    persist,
    refresh,
    changeRemote: (value: Source) => {
      remote = value;
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
});
describe("durable source drafts", () => {
  it("persists before the debounce and recovers without writing to the collection", async () => {
    vi.useFakeTimers();
    const { session, storage, persist } = fixture();
    session.edit("Recovered text");
    expect(readSourceDraft(storage, source)?.body).toBe("Recovered text");
    const recovered = fixture(storage);
    expect(recovered.session.getSnapshot()).toMatchObject({
      body: "Recovered text",
      recovered: true,
      locallySaved: true,
    });
    expect(recovered.persist).not.toHaveBeenCalled();
    await session.save();
    expect(persist).toHaveBeenCalledOnce();
    expect(readSourceDraft(storage, source)).toBeNull();
  });
  it("isolates identical source IDs in different collections", () => {
    expect(sourceDraftKey(source)).not.toBe(
      sourceDraftKey({ ...source, collectionId: collectionId("other") }),
    );
  });
  it("retains the draft when offline and retries successfully", async () => {
    vi.useFakeTimers();
    const { session, storage, refresh } = fixture();
    session.edit("Offline text");
    refresh.mockRejectedValueOnce(new Error("Offline")).mockRejectedValueOnce(new Error("Offline"));
    await session.save();
    expect(session.getSnapshot()).toMatchObject({
      status: "error",
      locallySaved: true,
      body: "Offline text",
    });
    expect(readSourceDraft(storage, source)?.body).toBe("Offline text");
    await session.save();
    expect(session.getSnapshot().status).toBe("saved");
  });
  it("requires a choice when the remote body changed, then uses the current revision", async () => {
    vi.useFakeTimers();
    const { session, persist, changeRemote } = fixture();
    session.edit("My changes");
    const remote = { ...source, body: "Other changes", recordRevision: recordRevision("2") };
    changeRemote(remote);
    await session.save();
    expect(session.getSnapshot().conflict).toEqual(remote);
    expect(persist).not.toHaveBeenCalled();
    session.resolve("local");
    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith(remote, "My changes"));
  });
  it("allows choosing the collection version without overwriting it", async () => {
    vi.useFakeTimers();
    const { session, storage, persist, changeRemote } = fixture();
    session.edit("My changes");
    changeRemote({ ...source, body: "Remote", recordRevision: recordRevision("2") });
    await session.save();
    session.resolve("remote");
    expect(session.getSnapshot()).toMatchObject({
      body: "Remote",
      status: "saved",
      conflict: null,
    });
    expect(readSourceDraft(storage, source)).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });
  it("never clears an edit typed during an in-flight save", async () => {
    vi.useFakeTimers();
    const { session, storage, persist } = fixture();
    let finish!: (value: Source) => void;
    persist.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    session.edit("First");
    const saving = session.save();
    await Promise.resolve();
    session.edit("Second");
    finish({ ...source, body: "First", recordRevision: recordRevision("2") });
    await saving;
    expect(session.getSnapshot()).toMatchObject({ body: "Second", status: "unsaved" });
    expect(readSourceDraft(storage, source)?.body).toBe("Second");
  });
  it("detects conflicting recovery but permits metadata-only revision changes", () => {
    const storage = memory();
    writeSourceDraft(storage, source, "Local");
    const metadata = { ...source, recordRevision: recordRevision("2") };
    const first = new SourceDraftSession(metadata, storage, vi.fn(), vi.fn(), vi.fn());
    expect(first.getSnapshot().conflict).toBeNull();
    const other = { ...metadata, body: "Remote" };
    const second = new SourceDraftSession(other, storage, vi.fn(), vi.fn(), vi.fn());
    expect(second.getSnapshot().conflict).toBe(other);
  });
  it("reports storage failure instead of claiming the draft is saved locally", () => {
    vi.useFakeTimers();
    const storage = memory();
    storage.setItem = () => {
      throw new Error("Quota");
    };
    const { session } = fixture(storage);
    session.edit("Important");
    expect(session.getSnapshot().locallySaved).toBe(false);
    expect(session.getSnapshot().localProblem).toContain("could not be saved locally");
  });
});
