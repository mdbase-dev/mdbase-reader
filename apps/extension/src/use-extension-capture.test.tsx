// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { fakeChrome } from "./testing/fake-chrome.js";
import { useExtensionCapture } from "./use-extension-capture.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  createSession: vi.fn(),
  save: vi.fn(),
  select: vi.fn(),
  list: vi.fn(),
  sourceForUrl: vi.fn(),
  captureTab: vi.fn(),
  readSelection: vi.fn(),
  prepareCitation: vi.fn(),
  rememberCollection: vi.fn(),
  snapshot: {
    status: "ready",
    collectionId: "test",
    connections: [],
    info: { displayName: "[test] Library" },
  },
}));
const session = {
  start: mocks.start,
  select: mocks.select,
  getSnapshot: (): typeof mocks.snapshot => mocks.snapshot,
  subscribe: (): (() => void) => vi.fn(),
  destroy: vi.fn(),
  connectedCollection: () => ({ collectionId: "test", annotations: { listForSource: mocks.list } }),
};
vi.mock("@mdbase-reader/connect", () => ({
  connectProblemMessage: (outcome: { problem?: { message: string } }) =>
    outcome.problem?.message ?? null,
}));
vi.mock("./connect-session.js", () => ({
  createExtensionSession: mocks.createSession,
  restoreCollection: () => Promise.resolve(mocks.snapshot),
  rememberCollection: mocks.rememberCollection,
}));
vi.mock("./capture-model.js", () => ({
  problemMessage: (reason: Error) => reason.message,
  sourceForUrl: mocks.sourceForUrl,
}));
vi.mock("./capture-citation.js", () => ({ prepareCitation: mocks.prepareCitation }));
vi.mock("./save-capture.js", () => ({
  CaptureWriter: class {
    save = mocks.save;
  },
}));
vi.mock("./page-capture.js", () => ({
  captureTab: mocks.captureTab,
  readSelection: mocks.readSelection,
  watchTabSelection: () => Promise.resolve(),
  fetchPdf: vi.fn(),
  renderAnnotations: () => Promise.resolve({ total: 0, shown: 0, missing: 0, ambiguous: 0 }),
}));

const page = {
  kind: "html",
  pageTitle: "[test] Article",
  canonicalUrl: "https://example.com/",
  submittedUrl: "https://example.com/",
  selection: { exact: "quotation" },
};
let root: Root;
let controller: ExtensionCaptureController;
let chromeFake: ReturnType<typeof fakeChrome>;
function Harness(): null {
  const current = useExtensionCapture(1);
  useEffect(() => {
    controller = current;
  }, [current]);
  return null;
}
async function mount(): Promise<void> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<Harness />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  chromeFake = fakeChrome();
  vi.stubGlobal("chrome", chromeFake.chrome);
  mocks.createSession.mockImplementation(() => Promise.resolve({ session, journalStorage: {} }));
  mocks.start.mockResolvedValue({ ok: true });
  mocks.select.mockReturnValue({ ok: true });
  mocks.sourceForUrl.mockResolvedValue(null);
  mocks.list.mockResolvedValue([]);
  mocks.captureTab.mockResolvedValue(page);
  mocks.readSelection.mockResolvedValue(null);
  mocks.prepareCitation.mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("does not auto-save on opening or changing the destination, and remembers the choice", async () => {
  await mount();
  expect(controller.capture?.selection?.exact).toBe("quotation");
  expect(controller.draft.highlight).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => {
    controller.select("other");
  });
  expect(mocks.select).toHaveBeenCalledWith("other");
  expect(mocks.rememberCollection).toHaveBeenCalledWith("other");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("recreates the transport on connection retry instead of restarting a stale session", async () => {
  await mount();
  expect(mocks.createSession).toHaveBeenCalledTimes(1);
  await act(async () => {
    await controller.retry();
  });
  expect(mocks.createSession).toHaveBeenCalledTimes(2);
  expect(session.destroy).toHaveBeenCalledTimes(1);
});
it("retains a failed draft and releases the action lock for an explicit retry", async () => {
  await mount();
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
  await mount();
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
  await mount();
  const source = { id: "source", collectionId: "test", title: "[test] Saved" };
  mocks.save.mockImplementationOnce(
    ({ onSource }: { onSource: (value: unknown, existing: boolean) => void }) => {
      onSource(source, false);
      return Promise.resolve({ source, annotation: null, existing: false, notices: [] });
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
it("releases Save and clears write progress before a slow refresh finishes", async () => {
  await mount();
  const source = { id: "source", collectionId: "test", title: "Saved" };
  let finish!: (value: never[]) => void;
  mocks.list.mockImplementationOnce(
    () =>
      new Promise<never[]>((resolve) => {
        finish = resolve;
      }),
  );
  mocks.save.mockImplementationOnce(
    ({
      onSource,
      onProgress,
    }: {
      onSource: (value: unknown, existing: boolean) => void;
      onProgress: (value: unknown) => void;
    }) => {
      onProgress({ phase: "creating" });
      onSource(source, false);
      return Promise.resolve({ source, annotation: null, notices: [] });
    },
  );
  await act(async () => {
    await controller.save();
  });
  expect(controller.busy).toBe(false);
  expect(controller.status).toBe("saved");
  expect(controller.progress).toBeNull();
  expect(controller.refreshing).toBe(true);
  await act(async () => {
    finish([]);
  });
  expect(controller.refreshing).toBe(false);
  const writes = mocks.save.mock.calls.length;
  await act(async () => {
    await controller.refreshHighlights();
  });
  expect(mocks.save).toHaveBeenCalledTimes(writes);
});
it("follows new selections from its own tab without re-reading the page", async () => {
  await mount();
  mocks.readSelection.mockResolvedValue({ exact: "a newer passage" });
  await act(async () => {
    chromeFake.emit("message", { type: "mdbase-reader/selection" }, { tab: { id: 2 } });
    chromeFake.emit("message", { type: "mdbase-reader/selection" }, { tab: { id: 1 } });
  });
  expect(mocks.readSelection).toHaveBeenCalledTimes(1);
  expect(controller.capture?.selection?.exact).toBe("a newer passage");
  expect(mocks.captureTab).toHaveBeenCalledTimes(1);
});
it("restores an unsaved comment kept for this tab and page", async () => {
  chromeFake.session.set("draft:1:https://example.com", {
    draft: { title: "Kept title", tags: "", note: "", comment: "Earlier thought", highlight: true },
    selection: { exact: "quotation" },
  });
  await mount();
  expect(controller.draft.comment).toBe("Earlier thought");
  expect(controller.draftRestored).toBe(true);
});
it("replaces the untouched page title with the citation title", async () => {
  mocks.prepareCitation.mockResolvedValue({
    citation: { type: "article-journal", title: "Deep learning" },
    origin: "doi",
  });
  await mount();
  expect(controller.draft.title).toBe("Deep learning");
  expect(controller.citation?.origin).toBe("doi");
});
it("asks to be invoked again after the tab navigates, then reads the new page", async () => {
  await mount();
  await act(async () => {
    chromeFake.emit("updated", 1, { status: "loading" });
  });
  expect(controller.navigated).toBe(true);
  mocks.captureTab.mockResolvedValue({ ...page, canonicalUrl: "https://example.com/next" });
  await act(async () => {
    chromeFake.emit("message", { type: "mdbase-reader/invoke", tabId: 1, intent: "capture" }, {});
  });
  expect(controller.navigated).toBe(false);
  expect(controller.capture?.canonicalUrl).toBe("https://example.com/next");
});
