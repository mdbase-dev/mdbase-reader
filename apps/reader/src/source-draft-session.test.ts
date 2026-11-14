import { mdbaseError } from "@mdbase-reader/connect/testing";
import { afterEach, expect, it, vi } from "vitest";

import { draftStorage, editorFixture } from "./editor.fixtures.js";
import { SourceDraftSession } from "./source-draft-session.js";
import { readSourceDraft, sourceDraftKey, writeSourceDraft } from "./source-draft-storage.js";
import { trackUnstoredSourceChanges } from "./unsaved-source-drafts.js";

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) {
    await close();
  }
  vi.restoreAllMocks();
});
async function fixture(): Promise<
  Awaited<ReturnType<typeof editorFixture>> & {
    session: SourceDraftSession;
    storage: ReturnType<typeof draftStorage>;
    publish: ReturnType<typeof vi.fn>;
  }
> {
  const native = await editorFixture();
  cleanup.push(native.close);
  const storage = draftStorage();
  const publish = vi.fn();
  const session = new SourceDraftSession(native.app.mdbase, native.source, storage, publish);
  cleanup.push(() => trackUnstoredSourceChanges(session, false));
  await session.save();
  return { ...native, storage, publish, session };
}

it("keeps a shared native writer and publishes its genuine acknowledged revision", async () => {
  const { session, app, publish, source } = await fixture();
  const update = vi.spyOn(app.client(), "update");
  session.edit("Saved source");
  await session.save();
  expect(session.getSnapshot()).toMatchObject({ status: "saved", body: "Saved source" });
  const saved = await app.client().get({ path: source.path }, { include: { body: true } });
  expect(saved.body).toBe("Saved source");
  expect(publish).toHaveBeenLastCalledWith(
    expect.objectContaining({ body: saved.body, recordRevision: saved.revision }),
  );
  expect(update).toHaveBeenCalledOnce();
  expect(session.getText()).toBe("Saved source");
});
it("notifies every editing view synchronously", async () => {
  const { session } = await fixture();
  const first = vi.fn();
  const second = vi.fn();
  const stop = session.subscribe(first);
  session.subscribe(second);
  session.edit("New text");
  expect(first).toHaveBeenCalled();
  expect(second).toHaveBeenCalled();
  stop();
  await session.save();
  expect(session.getSnapshot().status).toBe("saved");
});
it("keeps a newer edit typed during a held write", async () => {
  const { session, app, storage, source } = await fixture();
  const update = app.client().update.bind(app.client());
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(app.client(), "update").mockImplementationOnce(async (...args) => {
    const write = await update(...args);
    await held;
    return write;
  });
  session.edit("First edit");
  const saving = session.save();
  await vi.waitFor(() => expect(session.getSnapshot().status).toBe("saving"));
  session.edit("Newer edit");
  release();
  await saving;
  if (session.getSnapshot().status !== "saved") {
    expect(readSourceDraft(storage, source)?.body).toBe("Newer edit");
  }
  await session.save();
  expect(session.getText()).toBe("Newer edit");
  expect((await app.client().get({ path: source.path }, { include: { body: true } })).body).toBe(
    "Newer edit",
  );
});
it("retains pending device writes until the SDK confirms them", async () => {
  const { session, app, storage, source } = await fixture();
  app.replica().setOnline(false);
  session.edit("Offline text");
  await session.save();
  expect(app.client().ledger.getSnapshot().pending).toHaveLength(1);
  expect(readSourceDraft(storage, source)?.body).toBe("Offline text");
  app.replica().setOnline(true);
  await vi.waitFor(() => expect(app.client().ledger.getSnapshot().pending).toHaveLength(0));
  await vi.waitFor(() => expect(storage.getItem(sourceDraftKey(source))).toBeNull());
});
it("offers a recovered body conflict before sending any new write", async () => {
  const native = await editorFixture();
  cleanup.push(native.close);
  const storage = draftStorage();
  writeSourceDraft(storage, native.source, "Recovered local text");
  native.app.replica().editElsewhere(native.source.path, { body: "Other device text" });
  const update = vi.spyOn(native.app.client(), "update");
  const session = new SourceDraftSession(native.app.mdbase, native.source, storage, vi.fn());
  cleanup.push(() => trackUnstoredSourceChanges(session, false));
  await session.save();
  expect(session.getSnapshot()).toMatchObject({
    body: "Recovered local text",
    status: "unsaved",
    conflict: { body: "Other device text" },
  });
  expect(update).not.toHaveBeenCalled();
  session.resolve("remote");
  expect(session.getText()).toBe("Other device text");
  expect(update).not.toHaveBeenCalled();
});
it("rebases recovered text after an explicit local choice", async () => {
  const native = await editorFixture();
  cleanup.push(native.close);
  const storage = draftStorage();
  writeSourceDraft(storage, native.source, "Keep mine");
  native.app.replica().editElsewhere(native.source.path, { body: "Other device" });
  const session = new SourceDraftSession(native.app.mdbase, native.source, storage, vi.fn());
  cleanup.push(() => trackUnstoredSourceChanges(session, false));
  await session.save();
  session.resolve("local");
  await session.save();
  expect(session.getSnapshot()).toMatchObject({
    status: "saved",
    body: "Keep mine",
    conflict: null,
  });
});
it("does not turn a metadata-only revision change into a body conflict", async () => {
  const native = await editorFixture();
  cleanup.push(native.close);
  const storage = draftStorage();
  writeSourceDraft(storage, native.source, "Recovered text");
  native.app.replica().editElsewhere(native.source.path, { frontmatter: { tags: ["new"] } });
  const session = new SourceDraftSession(native.app.mdbase, native.source, storage, vi.fn());
  cleanup.push(() => trackUnstoredSourceChanges(session, false));
  await session.save();
  expect(session.getSnapshot()).toMatchObject({
    status: "saved",
    body: "Recovered text",
    conflict: null,
  });
  expect((await native.app.client().get({ path: native.source.path })).frontmatter["tags"]).toEqual(
    ["new"],
  );
});
it("keeps the exact SDK recovery reference when confirmation succeeds but readback fails", async () => {
  const { session, app, storage, source } = await fixture();
  const update = app.client().update.bind(app.client());
  let readbackUnavailable = false;
  const get = app.client().get.bind(app.client());
  vi.spyOn(app.client(), "get").mockImplementation((...args) =>
    readbackUnavailable
      ? Promise.reject(mdbaseError("unavailable", "Readback held"))
      : get(...args),
  );
  const writes = vi.spyOn(app.client(), "update").mockImplementationOnce(async (...args) => {
    const write = await update(...args);
    readbackUnavailable = true;
    return write;
  });
  session.edit("Ambiguous readback");
  await session.save();
  const draft = readSourceDraft(storage, source);
  expect(draft?.recovery).toMatchObject({
    mutationId: expect.any(String),
    recordId: expect.any(String),
    baseRevision: source.recordRevision,
  });
  readbackUnavailable = false;
  await session.save();
  expect(writes).toHaveBeenCalledOnce();
  expect(session.getSnapshot()).toMatchObject({ status: "saved", body: "Ambiguous readback" });
});
it("reports unavailable checkpoint storage instead of claiming a local save", async () => {
  const native = await editorFixture();
  cleanup.push(native.close);
  const storage = {
    getItem: () => null,
    removeItem: vi.fn(),
    setItem: () => {
      throw new Error("Storage unavailable");
    },
  };
  const session = new SourceDraftSession(native.app.mdbase, native.source, storage, vi.fn());
  cleanup.push(() => trackUnstoredSourceChanges(session, false));
  await session.save();
  session.edit("Keep this tab");
  session.subscribe(() => undefined)();
  expect(session.getSnapshot()).toMatchObject({
    locallySaved: false,
    localProblem: expect.any(String),
  });
});

it("reopens a native source lease after its last saved view closes", async () => {
  const { session } = await fixture();
  const detach = session.subscribe(vi.fn());
  detach();
  const stop = session.subscribe(vi.fn());
  session.edit("After returning");
  await session.save();
  expect(session.getSnapshot()).toMatchObject({ status: "saved", body: "After returning" });
  stop();
});
