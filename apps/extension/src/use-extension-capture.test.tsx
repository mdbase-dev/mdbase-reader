// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useExtensionCapture } from "./use-extension-capture.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  save: vi.fn(),
  select: vi.fn(),
  list: vi.fn(),
  sourceForUrl: vi.fn(),
  snapshot: {
    status: "ready",
    collectionId: "test",
    connections: [],
    info: { displayName: "[test] Library" },
  },
}));
vi.mock("@mdbase-reader/connect", () => ({
  connectProblemMessage: (outcome: { problem?: { message: string } }) =>
    outcome.problem?.message ?? null,
  ReaderPortableApplicationSession: class {
    start = mocks.start;
    select = mocks.select;
    getSnapshot = (): typeof mocks.snapshot => mocks.snapshot;
    subscribe = (): (() => void) => vi.fn();
    destroy = vi.fn();
    connectedCollection = (): {
      collectionId: string;
      annotations: { listForSource: typeof mocks.list };
    } => ({
      collectionId: "test",
      annotations: { listForSource: mocks.list },
    });
  },
}));
vi.mock("./capture-model.js", () => ({
  problemMessage: (reason: Error) => reason.message,
  sourceForUrl: mocks.sourceForUrl,
}));
vi.mock("./save-capture.js", () => ({
  CaptureWriter: class {
    save = mocks.save;
  },
}));
vi.mock("./page-capture.js", () => ({
  captureTab: () =>
    Promise.resolve({
      pageTitle: "[test] Article",
      canonicalUrl: "https://example.com",
      submittedUrl: "https://example.com",
      selection: { exact: "quotation" },
    }),
  renderAnnotations: () => Promise.resolve({ total: 0, shown: 0, missing: 0, ambiguous: 0 }),
}));
let root: Root;
let controller: ExtensionCaptureController;
function Harness(): null {
  const current = useExtensionCapture(1);
  useEffect(() => {
    controller = current;
  }, [current]);
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.start.mockResolvedValue({ ok: true });
  mocks.select.mockReturnValue({ ok: true });
  mocks.sourceForUrl.mockResolvedValue(null);
  mocks.list.mockResolvedValue([]);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<Harness />);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("does not auto-save on opening or changing the destination", async () => {
  expect(controller.capture?.selection?.exact).toBe("quotation");
  expect(controller.draft.highlight).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => {
    controller.select("other");
  });
  expect(mocks.select).toHaveBeenCalledWith("other");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("retains a failed draft and releases the action lock for an explicit retry", async () => {
  mocks.save.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    controller.setDraft((draft) => ({ ...draft, comment: "My unsaved note" }));
  });
  await act(async () => {
    await controller.save();
  });
  expect(controller.problem).toBe("offline");
  expect(controller.draft.comment).toBe("My unsaved note");
  expect(controller.busy).toBe(false);
  expect(controller.status).toBe("ready");
  expect(controller.source).toBeNull();
});
it("blocks double submits while a save is in flight", async () => {
  let reject!: (reason: Error) => void;
  mocks.save.mockImplementationOnce(
    () =>
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.save();
  });
  await act(async () => {
    await controller.save();
  });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async () => {
    reject(new Error("offline"));
    await pending;
  });
  expect(controller.busy).toBe(false);
});
it("reports a source as saved even if refreshing its annotations fails", async () => {
  const source = { id: "source", collectionId: "test", title: "[test] Saved" };
  mocks.save.mockImplementationOnce(
    ({ onSource }: { onSource: (value: unknown, existing: boolean) => void }) => {
      onSource(source, false);
      return Promise.resolve({ source, annotation: null, existing: false });
    },
  );
  mocks.list.mockRejectedValueOnce(new Error("refresh unavailable"));
  await act(async () => {
    await controller.save();
  });
  expect(controller.source?.title).toBe("[test] Saved");
  expect(controller.status).toBe("saved");
  expect(controller.problem).toBeNull();
  expect(controller.notice).toContain("Saved safely");
});
