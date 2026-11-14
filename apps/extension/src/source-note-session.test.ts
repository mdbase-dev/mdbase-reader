import { sourceFromDocument } from "@mdbase-reader/connect";
import { createTestApp } from "@mdbase-reader/connect/testing";
import { collectionId } from "@mdbase-reader/core";
import { afterEach, expect, it, vi } from "vitest";

import { SourceNoteSession, type NoteDraftStore } from "./source-note-session.js";

import type { NoteDraft } from "./drafts.js";
import type { MdbaseClient } from "@mdbase-dev/sdk";
import type { TestApp } from "@mdbase-reader/connect/testing";
import type { Source } from "@mdbase-reader/core";

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const close of cleanup.splice(0)) {
    await close();
  }
  vi.restoreAllMocks();
});
async function fixture(draft?: NoteDraft): Promise<{
  app: TestApp;
  client: MdbaseClient;
  source: Source;
  session: SourceNoteSession;
  store: NoteDraftStore;
  publish: ReturnType<typeof vi.fn>;
  stored: () => NoteDraft | null;
}> {
  const app = await createTestApp({
    collections: [
      {
        name: "Reading",
        records: [
          {
            path: "sources/note.md",
            types: ["reader-source"],
            frontmatter: { id: "note", title: "Title", tags: ["first"] },
            body: "Original",
          },
        ],
      },
    ],
  });
  cleanup.push(() => app.close());
  const client = app.client();
  const source = sourceFromDocument(
    collectionId(client.collection),
    await client.get({ path: "sources/note.md" }, { include: { body: true, effective: true } }),
  );
  let stored = draft ?? null;
  const store: NoteDraftStore = {
    load: () => Promise.resolve(stored),
    save: vi.fn((_collection, _source, value) => {
      stored = value;
      return Promise.resolve();
    }),
  };
  const publish = vi.fn();
  const session = new SourceNoteSession(app.mdbase, source, store, publish);
  await session.start();
  return { app, client, source, session, store, publish, stored: () => stored };
}
it("autosaves the note and details with a native record lease", async () => {
  const { session, source, client, stored, publish } = await fixture();
  session.edit("Edited");
  session.editDetails({ title: "New title", tags: ["changed"] });
  await vi.waitFor(() => expect(stored()?.body).toBe("Edited"));
  session.save();
  await vi.waitFor(() => expect(session.getSnapshot().state).toBe("saved"));
  const record = await client.get({ path: source.path }, { include: { body: true } });
  expect(record.body).toBe("Edited");
  expect(record.frontmatter).toMatchObject({ title: "New title", tags: ["changed"] });
  expect(stored()).toBeNull();
  expect(publish).toHaveBeenCalled();
});
it("restores unsent text and saves against its original base", async () => {
  const { session, stored } = await fixture({ body: "Restored", baseBody: "Original" });
  expect(session.getSnapshot()).toMatchObject({ body: "Restored", restored: true });
  session.save();
  await vi.waitFor(() => expect(session.getSnapshot().state).toBe("saved"));
  expect(stored()).toBeNull();
});
it.each(["mine", "theirs"] as const)(
  "asks before replacing a changed recovered base: %s",
  async (choice) => {
    const { session, client } = await fixture({ body: "Recovered", baseBody: "Old base" });
    const update = vi.spyOn(client, "update");
    expect(session.getSnapshot()).toMatchObject({ state: "conflict", body: "Recovered" });
    expect(update).not.toHaveBeenCalled();
    session.resolve(choice);
    await vi.waitFor(() => expect(session.getSnapshot().state).toBe("saved"));
    expect(session.getSnapshot().body).toBe(choice === "mine" ? "Recovered" : "Original");
    expect(update.mock.calls.length).toBe(choice === "mine" ? 1 : 0);
  },
);
it("observes remote body changes and retains conflicting local text", async () => {
  const { session, app, source } = await fixture();
  session.edit("Local");
  app.replica().editElsewhere(source.path, { body: "Remote" });
  await vi.waitFor(() =>
    expect(session.getSnapshot()).toMatchObject({
      state: "conflict",
      body: "Local",
      remote: { body: "Remote" },
    }),
  );
  session.resolve("theirs");
  expect(session.getSnapshot().body).toBe("Remote");
});
it("keeps title and tag changes in the browser checkpoint when the panel closes", async () => {
  const { session, stored } = await fixture();
  session.editDetails({ title: "Unsent title", tags: ["new"] });
  session.keepCopy();
  await vi.waitFor(() =>
    expect(stored()).toMatchObject({
      body: "Original",
      patch: { title: "Unsent title", tags: ["new"] },
    }),
  );
});
it("retains older request-only recovery without inventing a native witness", async () => {
  const draft = { body: "Uncertain text", baseBody: "Original", requestId: "earlier-request" };
  const { session, stored, client } = await fixture(draft);
  const update = vi.spyOn(client, "update");
  session.save();
  expect(session.getSnapshot().state).toBe("error");
  expect(stored()).toEqual(draft);
  expect(update).not.toHaveBeenCalled();
});
