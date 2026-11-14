import { afterEach, expect, it, vi } from "vitest";

import { AnnotationEditSession } from "./annotation-edit-session.js";
import { editorFixture } from "./editor.fixtures.js";
import { trackAnnotationEdits } from "./unsaved-annotation-edits.js";

vi.mock("./annotation-edit-recovery.js", () => ({
  readLegacyEdits: (_key: string, ready: (value: null) => void) => ready(null),
  clearLegacyEdits: vi.fn(),
}));
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) {
    await close();
  }
  vi.restoreAllMocks();
});
async function fixture(): Promise<
  Awaited<ReturnType<typeof editorFixture>> & { session: AnnotationEditSession }
> {
  const native = await editorFixture();
  cleanup.push(native.close);
  const session = new AnnotationEditSession(native.app.mdbase, native.annotation);
  cleanup.push(() => trackAnnotationEdits(session, native.annotation, false));
  session.start();
  await vi.waitFor(() => expect(session.getSnapshot().status).toBe("saved"));
  return { ...native, session };
}
it.each([false, true])(
  "accepts the native normalized acknowledgement with newer typing: %s",
  async (typing) => {
    const { app, session } = await fixture();
    const update = app.client().update.bind(app.client());
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writes = vi
      .spyOn(app.client(), "update")
      .mockImplementationOnce(async (ref, input, options) => {
        const write = await update(ref, { ...input, body: `${input.body ?? ""}\n` }, options);
        await held;
        return write;
      });
    session.edit("First");
    const saving = session.save();
    await vi.waitFor(() => expect(writes).toHaveBeenCalledOnce());
    if (typing) {
      session.edit("Second");
    }
    release();
    await saving;
    expect(session.getSnapshot().conflict).toBeNull();
    expect(session.getText()).toBe(typing ? "Second" : "First\n");
    if (typing) {
      await session.save();
      expect(session.getAnnotation().body).toBe("Second");
    }
  },
);
it.each(["Other client\n", "Original annotation\n"])(
  "keeps local edits when a remote revision changes the body to %s",
  async (body) => {
    const { app, annotation, session } = await fixture();
    const writes = vi.spyOn(app.client(), "update");
    session.edit("Second");
    app.replica().editElsewhere(annotation.path!, { body });
    await vi.waitFor(() => expect(session.getSnapshot().conflict?.body).toBe(body));
    expect(session.getText()).toBe("Second");
    expect(writes).not.toHaveBeenCalled();
  },
);
