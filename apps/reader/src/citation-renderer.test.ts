import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("warms one worker and correlates concurrent responses without running citeproc on the UI thread", async () => {
  class CitationWorker extends EventTarget {
    postMessage = vi.fn();
    terminate = vi.fn();
  }
  const worker = new CitationWorker();
  const constructor = vi.fn(function () {
    return worker;
  });
  vi.stubGlobal("Worker", constructor);
  const { preloadCitations, renderCitation } = await import("./citation-renderer.js");
  preloadCitations();
  const first = renderCitation({ id: "first" }, "apa", "en-US");
  const second = renderCitation({ id: "second" }, "apa", "it-IT");
  expect(constructor).toHaveBeenCalledOnce();
  const messages = worker.postMessage.mock.calls.map(([message]) => message as { id: number });
  worker.dispatchEvent(
    new MessageEvent("message", {
      data: { id: messages[1]?.id, rendered: { kind: "formatted", text: "Second" } },
    }),
  );
  worker.dispatchEvent(
    new MessageEvent("message", {
      data: { id: messages[0]?.id, rendered: { kind: "formatted", text: "First" } },
    }),
  );
  await expect(first).resolves.toEqual({ kind: "formatted", text: "First" });
  await expect(second).resolves.toEqual({ kind: "formatted", text: "Second" });
});

it("settles pending previews as failed if the worker cannot load", async () => {
  const worker = new EventTarget();
  const terminate = vi.fn();
  vi.stubGlobal(
    "Worker",
    vi.fn(function () {
      return Object.assign(worker, { postMessage: vi.fn(), terminate });
    }),
  );
  const { renderCitation } = await import("./citation-renderer.js");
  const result = renderCitation({ id: "offline" }, "apa", "en-US");
  worker.dispatchEvent(new Event("error"));
  await expect(result).resolves.toEqual({ kind: "failed" });
  expect(terminate).toHaveBeenCalledOnce();
});
