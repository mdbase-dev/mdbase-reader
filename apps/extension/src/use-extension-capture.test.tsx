// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";

import { fakeChrome } from "./testing/fake-chrome.js";
import { useExtensionCapture } from "./use-extension-capture.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  createSession: vi.fn(),
  save: vi.fn(),
  updateComment: vi.fn(),
  planDeletion: vi.fn(),
  reveal: vi.fn(),
  deleteAnnotation: vi.fn(),
  render: vi.fn(),
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
    updateComment = mocks.updateComment;
    planDeletion = mocks.planDeletion;
    delete = mocks.deleteAnnotation;
  },
}));
vi.mock("./page-capture.js", () => ({
  captureTab: mocks.captureTab,
  readSelection: mocks.readSelection,
  watchTabSelection: () => Promise.resolve(),
  fetchPdf: vi.fn(),
  renderAnnotations: mocks.render,
  revealAnnotation: mocks.reveal,
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
  mocks.render.mockImplementation((_tab: number, quotes: readonly unknown[]) =>
    Promise.resolve({
      report: { total: quotes.length, shown: quotes.length, missing: 0, ambiguous: 0 },
      outcomes: quotes.map(() => "shown"),
    }),
  );
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
  // A source found only while saving has highlights the panel has not loaded yet.
  const source = { id: "source", collectionId: "test", title: "[test] Saved" };
  mocks.save.mockImplementationOnce(
    ({ onSource }: { onSource: (value: unknown, existing: boolean) => void }) => {
      onSource(source, true);
      return Promise.resolve({ source, annotation: null, existing: true, notices: [] });
    },
  );
  mocks.list.mockRejectedValueOnce(new Error("refresh unavailable"));
  await act(async () => {
    await controller.save();
  });
  expect(controller.source?.title).toBe("[test] Saved");
  expect(controller.status).toBe("existing");
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
      onSource(source, true);
      return Promise.resolve({ source, annotation: null, existing: true, notices: [] });
    },
  );
  await act(async () => {
    await controller.save();
  });
  expect(controller.busy).toBe(false);
  expect(controller.status).toBe("existing");
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

const existing = { id: "source", collectionId: "test", title: "[test] Saved" };
function saved(id: string, exact: string): unknown {
  return {
    id,
    sourceId: "source",
    body: `> ${exact}`,
    tags: [],
    color: "blue",
    target: { quote: { exact } },
  };
}
it("shows a saved page's highlights and marks the toolbar button as soon as it opens", async () => {
  mocks.sourceForUrl.mockResolvedValue(existing);
  mocks.list.mockResolvedValue([saved("a1", "one"), saved("a2", "two")]);
  await mount();
  expect(mocks.render).toHaveBeenCalledWith(
    1,
    [
      { exact: "one", color: "blue" },
      { exact: "two", color: "blue" },
    ],
    "https://example.com/",
    undefined,
  );
  expect(controller.projection?.outcomes.get("a2" as never)).toBe("shown");
  expect(chromeFake.chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: "2" });
  expect(mocks.save).not.toHaveBeenCalled();
});
it("scrolls to one highlight on request", async () => {
  mocks.sourceForUrl.mockResolvedValue(existing);
  mocks.list.mockResolvedValue([saved("a1", "one"), saved("a2", "two")]);
  await mount();
  await act(async () => {
    await controller.revealHighlight("a2" as never);
  });
  // Scrolls to the drawn highlight without drawing the others again.
  const draws = mocks.render.mock.calls.length;
  expect(mocks.reveal).toHaveBeenLastCalledWith(1, expect.any(Array), 1, "https://example.com/");
  expect(mocks.render).toHaveBeenCalledTimes(draws);
});
it("saves in a chosen colour in one step and remembers it for the next highlight", async () => {
  mocks.save.mockResolvedValueOnce({
    source: existing,
    annotation: {},
    existing: true,
    notices: [],
  });
  await mount();
  await act(async () => {
    await controller.save({ highlight: true, color: "green" });
  });
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({ color: "green", highlight: true }),
    }),
  );
  expect(controller.draft.color).toBe("green");
  expect(chromeFake.local.get("highlight-color")).toBe("green");
  expect(controller.notice).toBe("Highlight saved.");
});
it("saves the highlight at once when invoked with Save highlight", async () => {
  mocks.sourceForUrl.mockResolvedValue(existing);
  mocks.save.mockResolvedValue({ source: existing, annotation: {}, existing: true, notices: [] });
  await mount();
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => {
    chromeFake.emit("message", { type: "mdbase-reader/invoke", tabId: 1, intent: "highlight" }, {});
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({ draft: expect.objectContaining({ highlight: true }) }),
  );
  // Other invocations only open the panel.
  await act(async () => {
    chromeFake.emit("message", { type: "mdbase-reader/invoke", tabId: 1, intent: "note" }, {});
  });
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
it("edits a highlight's comment and deletes a highlight from the list", async () => {
  mocks.sourceForUrl.mockResolvedValue(existing);
  const first = saved("a1", "one") as { id: string };
  mocks.list.mockResolvedValue([first, saved("a2", "two")]);
  await mount();
  const updated = { ...first, body: "> one\n\nNew thought" };
  mocks.updateComment.mockResolvedValueOnce(updated);
  await act(async () => {
    await controller.updateHighlightComment(controller.annotations[0]!, "New thought");
  });
  expect(mocks.updateComment).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ id: "a1" }),
    "New thought",
  );
  expect(controller.annotations[0]?.body).toContain("New thought");
  const plan = { annotationId: "a2", brokenLinkPaths: [] };
  mocks.planDeletion.mockResolvedValueOnce(plan);
  const second = controller.annotations[1]!;
  let planned: unknown;
  await act(async () => {
    planned = await controller.planHighlightDeletion(second);
  });
  await act(async () => {
    await controller.deleteHighlight(second, planned as never);
  });
  expect(mocks.deleteAnnotation).toHaveBeenCalledWith(expect.anything(), second, plan);
  expect(controller.annotations.map((annotation) => annotation.id)).toEqual(["a1"]);
  expect(chromeFake.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 1, text: "1" });
});
it("follows the tab to a new page by itself when page access is on", async () => {
  chromeFake.local.set("page-status", true);
  (chromeFake.chrome.permissions.contains as unknown as Mock).mockResolvedValue(true);
  await mount();
  await act(async () => {
    controller.setDraft((draft) => ({ ...draft, tags: "from the first page" }));
  });
  mocks.captureTab.mockResolvedValue({
    ...page,
    pageTitle: "[test] Next",
    canonicalUrl: "https://example.com/next",
    submittedUrl: "https://example.com/next",
  });
  await act(async () => {
    chromeFake.emit("updated", 1, { status: "loading" });
  });
  // Following from the first moment: no request to reopen the extension.
  expect(controller.navigated).toBe(true);
  expect(controller.following).toBe(true);
  await act(async () => {
    chromeFake.emit("updated", 1, { status: "complete" });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(controller.navigated).toBe(false);
  expect(controller.following).toBe(false);
  expect(controller.capture?.canonicalUrl).toBe("https://example.com/next");
  expect(controller.draft.title).toBe("[test] Next");
  expect(controller.draft.tags).toBe("");
});
it("waits to be invoked again after navigating when page access is off", async () => {
  await mount();
  await act(async () => {
    chromeFake.emit("updated", 1, { status: "loading" });
  });
  await act(async () => {
    chromeFake.emit("updated", 1, { status: "complete" });
  });
  expect(controller.navigated).toBe(true);
  expect(controller.following).toBe(false);
  expect(mocks.captureTab).toHaveBeenCalledTimes(1);
});
it("asks to be invoked again when following reaches a page it cannot read", async () => {
  chromeFake.local.set("page-status", true);
  (chromeFake.chrome.permissions.contains as unknown as Mock).mockResolvedValue(true);
  await mount();
  mocks.captureTab.mockRejectedValue(new Error("Cannot access a chrome:// URL"));
  await act(async () => {
    chromeFake.emit("updated", 1, { status: "loading" });
  });
  expect(controller.following).toBe(true);
  await act(async () => {
    chromeFake.emit("updated", 1, { status: "complete" });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(controller.navigated).toBe(true);
  expect(controller.following).toBe(false);
  expect(controller.problem).toBeNull();
});
it("adds a highlight saved with a new source without reading the list again, and can undo it", async () => {
  await mount();
  const source = { id: "source", collectionId: "test", title: "[test] New" };
  const annotation = {
    id: "a1",
    sourceId: "source",
    color: "yellow",
    tags: [],
    body: "> passage",
    target: { quote: { exact: "passage" } },
  };
  mocks.save.mockImplementationOnce(
    ({ onSource }: { onSource: (value: unknown, existing: boolean) => void }) => {
      onSource(source, false);
      return Promise.resolve({ source, annotation, existing: false, notices: [] });
    },
  );
  const listed = mocks.list.mock.calls.length;
  await act(async () => {
    await controller.save({ highlight: true, color: "yellow" });
  });
  expect(mocks.list).toHaveBeenCalledTimes(listed);
  expect(controller.annotations.map((value) => value.id)).toEqual(["a1"]);
  expect(controller.undoable).toBe(true);

  const plan = { annotationId: "a1", path: "annotations/a1.md", brokenLinkPaths: [] };
  mocks.planDeletion.mockResolvedValueOnce(plan);
  mocks.deleteAnnotation.mockResolvedValueOnce(undefined);
  await act(async () => {
    await controller.undoHighlight();
  });
  expect(mocks.deleteAnnotation).toHaveBeenCalledWith(expect.anything(), annotation, plan);
  expect(controller.annotations).toEqual([]);
  expect(controller.undoable).toBe(false);
  expect(controller.notice).toBe("Highlight removed. The page stays saved.");
});
it("keeps a highlight that other notes link to when undo is pressed", async () => {
  await mount();
  const source = { id: "source", collectionId: "test", title: "[test] New" };
  const annotation = {
    id: "a1",
    sourceId: "source",
    tags: [],
    body: "",
    target: { quote: { exact: "x" } },
  };
  mocks.save.mockImplementationOnce(
    ({ onSource }: { onSource: (value: unknown, existing: boolean) => void }) => {
      onSource(source, false);
      return Promise.resolve({ source, annotation, existing: false, notices: [] });
    },
  );
  await act(async () => {
    await controller.save({ highlight: true });
  });
  mocks.planDeletion.mockResolvedValueOnce({ brokenLinkPaths: ["notes/n.md"] });
  mocks.deleteAnnotation.mockClear();
  await act(async () => {
    await controller.undoHighlight();
  });
  expect(mocks.deleteAnnotation).not.toHaveBeenCalled();
  expect(controller.problem).toContain("Other notes already link to this highlight");
  expect(controller.undoable).toBe(false);
});
