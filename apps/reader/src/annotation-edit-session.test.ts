import { afterEach, expect, it, vi } from "vitest";

import { AnnotationDeletionLease } from "./annotation-deletion-lease.js";
import { AnnotationEditSession } from "./annotation-edit-session.js";
import { editorFixture } from "./editor.fixtures.js";
import { trackAnnotationEdits } from "./unsaved-annotation-edits.js";

const legacy = vi.hoisted(() => ({
  value: null as { body: string; baseBody?: string } | null,
  clear: vi.fn(),
}));
vi.mock("./annotation-edit-recovery.js", () => ({
  readLegacyEdits: (_key: string, ready: (value: typeof legacy.value) => void) =>
    ready(legacy.value),
  clearLegacyEdits: legacy.clear,
}));
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) {
    await close();
  }
  legacy.value = null;
  legacy.clear.mockClear();
  vi.restoreAllMocks();
});
async function fixture(): Promise<
  Awaited<ReturnType<typeof editorFixture>> & {
    session: AnnotationEditSession;
    publish: ReturnType<typeof vi.fn>;
  }
> {
  const native = await editorFixture();
  cleanup.push(native.close);
  const publish = vi.fn();
  const session = new AnnotationEditSession(native.app.mdbase, native.annotation, publish);
  cleanup.push(() => trackAnnotationEdits(session, native.annotation, false));
  session.start();
  await vi.waitFor(() => expect(session.getSnapshot().status).toBe("saved"));
  return { ...native, session, publish };
}

it("uses a native writer and exposes its actual acknowledgement", async () => {
  const { session, app, annotation, publish } = await fixture();
  const update = vi.spyOn(app.client(), "update");
  session.edit("New annotation");
  await session.save();
  expect(session.getSnapshot().status).toBe("saved");
  expect(update).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenLastCalledWith(
    expect.objectContaining({
      body: "New annotation",
      recordRevision: session.getAnnotation().recordRevision,
    }),
  );
  const saved = await app.client().get({ path: annotation.path! }, { include: { body: true } });
  expect(saved.body).toBe("New annotation");
  expect(saved.frontmatter["modified_at"]).toEqual(expect.any(String));
});
it("preserves a newer edit while a native write is held", async () => {
  const { session, app } = await fixture();
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
  session.edit("First");
  const saving = session.save();
  await vi.waitFor(() => expect(session.getSnapshot().status).toBe("saving"));
  session.edit("Newer");
  release();
  await saving;
  await session.save();
  expect(session.getText()).toBe("Newer");
  expect(session.getSnapshot().status).toBe("saved");
});
it("transfers editor ownership while retaining one native session", async () => {
  const { session } = await fixture();

  const first = {};
  const second = {};
  expect(session.claimEditor(first)).toBe(true);
  expect(session.claimEditor(second)).toBe(false);
  expect(session.claimEditor(second, true)).toBe(true);
  session.releaseEditor(first);
  expect(session.ownsEditor(second)).toBe(true);
  session.edit("Kept after close");
  session.releaseEditor(second);
  await session.save();
  expect(session.getText()).toBe("Kept after close");
});
it("discards only an unsent change", async () => {
  const { session, app } = await fixture();
  const update = vi.spyOn(app.client(), "update");
  session.edit("Unsent");
  session.discard();
  expect(session.getText()).toBe("Original annotation");
  await session.save();
  expect(update).not.toHaveBeenCalled();
});
it("holds deletion by owner after flushing the SDK writer", async () => {
  const { session } = await fixture();
  const first = {};
  const second = {};
  session.edit("Before deletion");
  expect(await session.lock(first)).toBe(true);
  expect(await session.lock(second)).toBe(false);
  session.edit("Blocked");
  expect(session.getText()).toBe("Before deletion");
  session.unlock(second);
  expect(session.getSnapshot().locked).toBe(true);
  session.unlock(first);
  expect(session.getSnapshot().locked).toBe(false);
});
it("releases an abandoned deletion check and holds a committed deletion", async () => {
  const { session } = await fixture();
  const lease = new AnnotationDeletionLease(session);
  // The existing lease helper keeps deletion ownership outside the native writer.
  const detach = lease.attach();
  expect(await lease.acquire()).toBe(true);
  detach();
  expect(session.getSnapshot().locked).toBe(false);
  const detachAgain = lease.attach();
  expect(await lease.acquire()).toBe(true);
  lease.commit();
  detachAgain();
  expect(session.getSnapshot().locked).toBe(true);
  lease.release();
  expect(session.getSnapshot().locked).toBe(false);
});
it("does not overwrite a recovered legacy draft whose base is unknown", async () => {
  legacy.value = { body: "Earlier draft" };
  const native = await editorFixture();
  cleanup.push(native.close);
  const session = new AnnotationEditSession(native.app.mdbase, native.annotation);
  cleanup.push(() => trackAnnotationEdits(session, native.annotation, false));
  const update = vi.spyOn(native.app.client(), "update");
  session.start();
  await vi.waitFor(() => expect(session.getSnapshot().conflict).not.toBeNull());
  expect(session.getText()).toBe("Earlier draft");
  expect(update).not.toHaveBeenCalled();
  session.resolve("remote");
  expect(session.getText()).toBe("Original annotation");
  expect(legacy.clear).toHaveBeenCalledOnce();
});

it("releases a clean native lease when its last view closes and reopens on return", async () => {
  const { session } = await fixture();
  const detach = session.subscribe(vi.fn());
  detach();
  const returned = session.subscribe(vi.fn());
  await vi.waitFor(() => {
    session.edit("After return");
    expect(session.getText()).toBe("After return");
  });
  await session.save();
  expect(session.getSnapshot().status).toBe("saved");
  returned();
});
