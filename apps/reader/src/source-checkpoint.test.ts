import { afterEach, expect, it, vi } from "vitest";

import { draftStorage, editorFixture } from "./editor.fixtures.js";
import { flushLocalDraftCheckpoints } from "./local-draft-checkpoint.js";
import { SourceDraftSession } from "./source-draft-session.js";
import { readSourceDraft, writeSourceDraft } from "./source-draft-storage.js";
import { trackUnstoredSourceChanges } from "./unsaved-source-drafts.js";

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  flushLocalDraftCheckpoints();
  vi.useRealTimers();
  for (const close of cleanup.splice(0)) {
    await close();
  }
  vi.restoreAllMocks();
});
async function fixture(): Promise<
  Awaited<ReturnType<typeof editorFixture>> & {
    session: SourceDraftSession;
    storage: ReturnType<typeof draftStorage>;
    update: ReturnType<typeof vi.spyOn>;
  }
> {
  const native = await editorFixture();
  cleanup.push(native.close);
  const storage = draftStorage();
  const session = new SourceDraftSession(native.app.mdbase, native.source, storage, vi.fn());
  cleanup.push(() => trackUnstoredSourceChanges(session, false));
  await session.save();
  return { ...native, session, storage, update: vi.spyOn(native.app.client(), "update") };
}
it("shares large edits immediately and checkpoints only the latest text after idle", async () => {
  const { session, storage, source, update } = await fixture();
  vi.useFakeTimers();
  const write = vi.spyOn(storage, "setItem");
  const body = "Large note. ".repeat(10_000);
  for (let i = 0; i < 20; i++) {
    session.edit(`${body}${String(i)}`);
    expect(session.getText()).toBe(`${body}${String(i)}`);
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(450);
  expect(write).toHaveBeenCalledOnce();
  expect(readSourceDraft(storage, source)?.body).toBe(`${body}19`);
  expect(update).not.toHaveBeenCalled();
});
it("checkpoints every three seconds while typing continues", async () => {
  const { session, storage, source, update } = await fixture();
  vi.useFakeTimers();
  const write = vi.spyOn(storage, "setItem");
  for (let i = 0; i < 60; i++) {
    session.edit(`Continuous ${String(i)}`);
    await vi.advanceTimersByTimeAsync(100);
  }
  expect(write).toHaveBeenCalledTimes(2);
  expect(readSourceDraft(storage, source)?.body).toBe("Continuous 59");
  expect(update).not.toHaveBeenCalled();
});
it("flushes on last-view close and retains the independent native autosave", async () => {
  const { session, storage, source, update } = await fixture();
  const detach = session.subscribe(vi.fn());
  session.edit("Closing immediately");
  detach();
  expect(readSourceDraft(storage, source)?.body).toBe("Closing immediately");
  await vi.waitFor(() => expect(update).toHaveBeenCalledOnce(), { timeout: 2000 });
  await vi.waitFor(() => expect(readSourceDraft(storage, source)).toBeNull());
});
it.each([false, true])(
  "choosing remote preserves a newer other-window checkpoint: %s",
  async (otherWindow) => {
    const { session, storage, source, app } = await fixture();
    session.edit("Our checkpoint");
    flushLocalDraftCheckpoints();
    session.edit("Pending newer text");
    if (otherWindow) {
      writeSourceDraft(storage, source, "Other window's draft");
    }
    app.replica().editElsewhere(source.path, { body: "Remote" });
    await vi.waitFor(() => expect(session.getSnapshot().conflict).not.toBeNull());
    session.resolve("remote");
    expect(session.getText()).toBe("Remote");
    expect(readSourceDraft(storage, source)?.body ?? null).toBe(
      otherWindow ? "Other window's draft" : null,
    );
  },
);
