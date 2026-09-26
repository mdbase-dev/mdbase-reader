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
  };
  /** Another application edits the note. */
  edit(body: string): void;
}

/** A collection holding one source that refuses writes against a stale revision. */
function fakeCollection(initial: Source): FakeCollection {
  let current = initial;
  let revision = 1;
  const sources = {
    get: vi.fn(() => Promise.resolve(current)),
    updateBody: vi.fn(
      (input: { readonly expectedRevision: string; readonly body: string }): Promise<Source> => {
        if (input.expectedRevision !== current.recordRevision) {
          return Promise.reject(new Error("The source changed before saving."));
        }
        revision += 1;
        current = source(input.body, `r${String(revision)}`);
        return Promise.resolve(current);
      },
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
      revision += 1;
      current = source(body, `r${String(revision)}`);
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

it("keeps saving the note after the panel changes the source's title", async () => {
  const fake = fakeCollection(source("Body", "r1"));
  const session = new SourceNoteSession(source("Body", "r1"), fake.collection, memoryStore());
  await session.start();

  // A title save writes a new revision; the panel hands it to the note session.
  fake.edit("Body");
  session.accept(await fake.sources.get());
  session.edit("Body, continued");
  await vi.advanceTimersByTimeAsync(1100);

  expect(session.getSnapshot().state).toBe("saved");
  expect(fake.sources.updateBody).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: "r2" }),
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
