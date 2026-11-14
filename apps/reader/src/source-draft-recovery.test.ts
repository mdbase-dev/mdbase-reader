import { mdbaseError } from "@mdbase-reader/connect/testing";
import { afterEach, expect, it, vi } from "vitest";

import { draftStorage, editorFixture } from "./editor.fixtures.js";
import { SourceDraftSession } from "./source-draft-session.js";
import { readSourceDraft } from "./source-draft-storage.js";
import { trackUnstoredSourceChanges } from "./unsaved-source-drafts.js";

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) {
    await close();
  }
  vi.restoreAllMocks();
});
it("recovers the original mutation before submitting newer source text", async () => {
  const { app, source, close } = await editorFixture();
  cleanup.push(close);
  const storage = draftStorage();
  const session = new SourceDraftSession(app.mdbase, source, storage, vi.fn());
  cleanup.push(() => trackUnstoredSourceChanges(session, false));
  await session.save();
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
  session.edit("First");
  await session.save();
  const mutation = readSourceDraft(storage, source)?.recovery?.mutationId;
  expect(mutation).toEqual(expect.any(String));
  readbackUnavailable = false;
  session.edit("Second");
  await session.save();
  await session.save();
  expect(writes).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot()).toMatchObject({ status: "saved", body: "Second" });
  expect(readSourceDraft(storage, source)).toBeNull();
});
