import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SourceNoteSession, type NoteDraftStore } from "./source-note-session.js";

import type { NoteDraft } from "./drafts.js";
import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { Source } from "@mdbase-reader/core";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function source(body: string, revision: string): Source {
  return {
    id: "s1",
    collectionId: "c1",
    path: "sources/s1.md",
    title: "[test] Source",
    creators: [],
    tags: [],
    documents: [],
    frontmatter: {},
    body,
    recordRevision: revision,
  } as unknown as Source;
}

interface FakeCollection {
  readonly collection: ReaderConnectedCollection;
  readonly sources: {
    readonly get: () => Promise<Source>;
    readonly updateBody: ReturnType<typeof vi.fn>;
    readonly updateFields: ReturnType<typeof vi.fn>;
  };
  /** Another application edits the note. */
  edit(body: string): void;
  /** Another application edits the source's title or tags. */
  editFields(fields: Partial<Pick<Source, "title" | "tags">>): void;
}

/** A collection holding one source that refuses writes against a stale revision. */
function fakeCollection(initial: Source): FakeCollection {
  let current = initial;
  let revision = 1;
  const next = (changes: Partial<Source>): Source => {
    revision += 1;
    current = { ...current, ...changes, recordRevision: `r${String(revision)}` } as Source;
    return current;
  };
  const sources = {
    get: vi.fn(() => Promise.resolve(current)),
    updateBody: vi.fn(
      (input: { readonly expectedRevision: string; readonly body: string }): Promise<Source> => {
        if (input.expectedRevision !== current.recordRevision) {
          return Promise.reject(new Error("The source changed before saving."));
        }
        return Promise.resolve(next({ body: input.body }));
      },
    ),
    // Like the repository's, it writes over whatever is current.
    updateFields: vi.fn((input: { readonly fields: Partial<Source> }): Promise<Source> =>
      Promise.resolve(next(input.fields)),
    ),
  };
  const collection = {
    collectionId: "c1",
    sources,
    bodyRecovery: { pending: () => false, recoverSource: vi.fn() },
  } as unknown as ReaderConnectedCollection;
  return {
    collection,
    sources,
    edit(body: string): void {
      next({ body });
    },
    editFields(fields): void {
      next(fields);
    },
  };
}

function memoryStore(initial?: NoteDraft): NoteDraftStore & {
  readonly drafts: Map<string, NoteDraft>;
} {
  const drafts = new Map<string, NoteDraft>(initial ? [["c1 s1", initial]] : []);
  return {
    drafts,
    load: (collectionId, sourceId) =>
      Promise.resolve(drafts.get(`${collectionId} ${sourceId}`) ?? null),
    save: (collectionId, sourceId, draft) => {
      if (draft) {
        drafts.set(`${collectionId} ${sourceId}`, draft);
      } else {
        drafts.delete(`${collectionId} ${sourceId}`);
      }
      return Promise.resolve();
    },
  };
}

it("autosaves typing against the loaded revision, keeping a browser copy until saved", async () => {
  const fake = fakeCollection(source("First", "r1"));
  const store = memoryStore();
  const session = new SourceNoteSession(source("First", "r1"), fake.collection, store);
  await session.start();

  session.edit("First, then more");
  expect(session.getSnapshot().state).toBe("unsaved");
  await vi.advanceTimersByTimeAsync(300);
  expect(store.drafts.get("c1 s1")).toEqual({ body: "First, then more", baseBody: "First" });

  await vi.advanceTimersByTimeAsync(1000);
  expect(fake.sources.updateBody).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: "r1", body: "First, then more" }),
  );
  expect(session.getSnapshot().state).toBe("saved");
  expect(store.drafts.size).toBe(0);
});

it("brings back text left by a closed panel and saves it", async () => {
  const fake = fakeCollection(source("Saved", "r1"));
  const store = memoryStore({ body: "Saved and unsent", baseBody: "Saved" });
  const session = new SourceNoteSession(source("Saved", "r1"), fake.collection, store);
  await session.start();

  expect(session.getSnapshot()).toMatchObject({ body: "Saved and unsent", restored: true });
  await vi.advanceTimersByTimeAsync(1100);
  expect(fake.sources.updateBody).toHaveBeenCalledWith(
    expect.objectContaining({ body: "Saved and unsent" }),
  );
  expect(session.getSnapshot().state).toBe("saved");
  expect(store.drafts.size).toBe(0);
});

it("asks before restoring text whose note changed elsewhere meanwhile", async () => {
  const fake = fakeCollection(source("Edited in Reader", "r2"));
  const store = memoryStore({ body: "Typed in the panel", baseBody: "Original" });
  const session = new SourceNoteSession(source("Edited in Reader", "r2"), fake.collection, store);
  await session.start();

  expect(session.getSnapshot().state).toBe("conflict");
  await vi.advanceTimersByTimeAsync(2000);
  expect(fake.sources.updateBody).not.toHaveBeenCalled();

  session.resolve("theirs");
  await vi.advanceTimersByTimeAsync(300);
  expect(session.getSnapshot()).toMatchObject({ state: "saved", body: "Edited in Reader" });
  expect(store.drafts.size).toBe(0);
});

it("does not overwrite a note edited in Reader while the panel was typing", async () => {
  const fake = fakeCollection(source("Shared", "r1"));
  const session = new SourceNoteSession(source("Shared", "r1"), fake.collection, memoryStore());
  await session.start();

  session.edit("Shared, from the panel");
  fake.edit("Shared, from Reader");
  await vi.advanceTimersByTimeAsync(1100);

  const note = session.getSnapshot();
  expect(note.state).toBe("conflict");
  expect(note.remote?.body).toBe("Shared, from Reader");
  expect(note.body).toBe("Shared, from the panel");

  session.resolve("mine");
  await vi.advanceTimersByTimeAsync(1100);
  expect(session.getSnapshot()).toMatchObject({ state: "saved", body: "Shared, from the panel" });
  expect(fake.sources.updateBody).toHaveBeenLastCalledWith(
    expect.objectContaining({ body: "Shared, from the panel" }),
  );
});

it("autosaves a changed title and tags with the note, and publishes the saved source", async () => {
  const fake = fakeCollection(source("Body", "r1"));
  const publish = vi.fn();
  const session = new SourceNoteSession(
    source("Body", "r1"),
    fake.collection,
    memoryStore(),
    publish,
  );
  await session.start();

  session.editDetails({ title: "[test] Renamed", tags: ["ml"] });
  session.edit("Body, continued");
  expect(session.getSnapshot()).toMatchObject({
    state: "unsaved",
    details: { title: "[test] Renamed", tags: ["ml"] },
  });
  await vi.advanceTimersByTimeAsync(1100);

  expect(fake.sources.updateFields).toHaveBeenCalledWith(
    expect.objectContaining({ fields: { title: "[test] Renamed", tags: ["ml"] } }),
  );
  // The note is written against the revision the fields write produced.
  expect(fake.sources.updateBody).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: "r2", body: "Body, continued" }),
  );
  expect(session.getSnapshot().state).toBe("saved");
  expect(publish).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: "[test] Renamed", body: "Body, continued" }),
  );
});

it("does not save a cleared title", async () => {
  const fake = fakeCollection(source("Body", "r1"));
  const session = new SourceNoteSession(source("Body", "r1"), fake.collection, memoryStore());
  await session.start();
  session.editDetails({ title: "  " });
  await vi.advanceTimersByTimeAsync(1100);
  expect(session.getSnapshot()).toMatchObject({
    state: "saved",
    details: { title: "[test] Source" },
  });
  expect(fake.sources.updateFields).not.toHaveBeenCalled();
});

it("takes in a title changed elsewhere while only the note is edited here", async () => {
  const fake = fakeCollection(source("Body", "r1"));
  const session = new SourceNoteSession(source("Body", "r1"), fake.collection, memoryStore());
  await session.start();

  session.edit("Body, from the panel");
  fake.editFields({ title: "[test] From Reader" });
  await vi.advanceTimersByTimeAsync(3000);

  expect(session.getSnapshot()).toMatchObject({
    state: "saved",
    body: "Body, from the panel",
    details: { title: "[test] From Reader" },
  });
});

it("asks when the title changed both here and elsewhere, showing their version", async () => {
  const fake = fakeCollection(source("Body", "r1"));
  const session = new SourceNoteSession(source("Body", "r1"), fake.collection, memoryStore());
  await session.start();

  session.editDetails({ title: "[test] Mine" });
  fake.editFields({ title: "[test] Theirs" });
  await vi.advanceTimersByTimeAsync(1100);

  expect(session.getSnapshot()).toMatchObject({
    state: "conflict",
    details: { title: "[test] Mine" },
    remote: { title: "[test] Theirs" },
  });
  expect(fake.sources.updateFields).not.toHaveBeenCalled();

  session.resolve("mine");
  await vi.advanceTimersByTimeAsync(1100);
  expect(fake.sources.updateFields).toHaveBeenCalledWith(
    expect.objectContaining({ fields: { title: "[test] Mine" } }),
  );
  expect(session.getSnapshot().state).toBe("saved");
});

it("keeps an unsaved title for a closed panel and saves it when the panel returns", async () => {
  const store = memoryStore();
  const fake = fakeCollection(source("Body", "r1"));
  const first = new SourceNoteSession(source("Body", "r1"), fake.collection, store);
  await first.start();
  first.editDetails({ title: "[test] Kept" });
  first.keepCopy();
  await vi.advanceTimersByTimeAsync(300);
  expect(store.drafts.get("c1 s1")).toMatchObject({
    patch: { title: "[test] Kept" },
    baseFrontmatter: { title: "[test] Source", tags: [] },
  });

  // A new panel, before the first one saved.
  const fresh = fakeCollection(source("Body", "r1"));
  const second = new SourceNoteSession(source("Body", "r1"), fresh.collection, store);
  await second.start();
  expect(second.getSnapshot()).toMatchObject({
    restored: true,
    details: { title: "[test] Kept" },
  });
  await vi.advanceTimersByTimeAsync(1100);
  expect(fresh.sources.updateFields).toHaveBeenCalledWith(
    expect.objectContaining({ fields: { title: "[test] Kept" } }),
  );
});

it("says when the browser cannot keep a copy of unsaved text", async () => {
  const fake = fakeCollection(source("Body", "r1"));
  const session = new SourceNoteSession(source("Body", "r1"), fake.collection, {
    load: () => Promise.reject(new Error("storage unavailable")),
    save: () => Promise.reject(new Error("storage unavailable")),
  });
  await session.start();
  expect(session.getSnapshot().localProblem).toContain("could not keep a copy");
});
