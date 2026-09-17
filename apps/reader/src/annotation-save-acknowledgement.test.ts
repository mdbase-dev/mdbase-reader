import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";

import { AnnotationEditSession } from "./annotation-edit-session.js";
import { trackAnnotationEdits } from "./unsaved-annotation-edits.js";

vi.mock("./annotation-edit-recovery.js", () => ({
  readLegacyEdits: (_key: string, ready: (value: null) => void) => ready(null),
  clearLegacyEdits: vi.fn(),
}));
const annotation: Annotation = {
  id: annotationId("ack"),
  collectionId: collectionId("c"),
  sourceId: sourceId("s"),
  source: "[[s]]",
  path: "annotations/ack.md",
  recordRevision: recordRevision("1"),
  annotationType: "note",
  tags: [],
  body: "Original",
  createdAt: dateTime("2026-09-17T00:00:00Z"),
};
const sessions: AnnotationEditSession[] = [];
function saved(body: string, revision = "2"): Annotation {
  return { ...annotation, body, recordRevision: recordRevision(revision) };
}
function fixture(): {
  session: AnnotationEditSession;
  persist: Mock<(base: Annotation, body: string) => Promise<Annotation>>;
  pending: Promise<void>;
  finish: (value: Annotation) => void;
} {
  let finish!: (value: Annotation) => void;
  const persist = vi.fn((_base: Annotation, body: string) => Promise.resolve(saved(body, "4")));
  persist.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const session = new AnnotationEditSession(annotation, persist);
  sessions.push(session);
  session.start();
  session.edit("First");
  const pending = session.save();
  return { session, persist, pending, finish: (value: Annotation) => finish(value) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const session of sessions.splice(0)) {
    trackAnnotationEdits(session, annotation, false);
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});
it.each([false, true])(
  "recognizes its normalized save response before publication completes (newer typing: %s)",
  async (typing) => {
    const { session, persist, pending, finish } = fixture();
    if (typing) {
      session.edit("Second");
    }
    const acknowledged = saved("First\n");
    session.receive(acknowledged); // Shared resource publishes before the save promise settles.
    expect(session.getSnapshot().conflict).toBeNull();
    finish(acknowledged);
    await pending;
    expect(session.getSnapshot().conflict).toBeNull();
    expect(session.getText()).toBe(typing ? "Second" : "First\n");
    if (typing) {
      await vi.advanceTimersByTimeAsync(1000);
      expect(persist).toHaveBeenLastCalledWith(acknowledged, "Second");
    }
  },
);
it.each([false, true])(
  "does not hide another revision behind its normalized acknowledgement (ack first: %s)",
  async (ackFirst) => {
    const { session, persist, pending, finish } = fixture();
    session.edit("Second");
    const acknowledged = saved("First\n"),
      external = saved("Other client\n", "3");
    for (const record of ackFirst ? [acknowledged, external] : [external, acknowledged]) {
      session.receive(record);
    }
    finish(acknowledged);
    await pending;
    expect(session.getSnapshot().conflict).toEqual(external);
    expect(session.getText()).toBe("Second");
    await vi.advanceTimersByTimeAsync(5000);
    expect(persist).toHaveBeenCalledOnce();
  },
);
it("still conflicts on another revision's whitespace-only edit", async () => {
  const { session, pending, finish } = fixture();
  session.edit("Second");
  const acknowledged = saved("First\n"),
    external = saved("First\n\n", "3");
  session.receive(external);
  session.receive(acknowledged);
  finish(acknowledged);
  await pending;
  expect(session.getSnapshot().conflict).toEqual(external);
  expect(session.getText()).toBe("Second");
});
