import type { CitationItem, RenderedCitation } from "@mdbase-reader/ui/citation";

let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, (value: RenderedCitation) => void>();

export function preloadCitations(): Worker {
  if (worker) {
    return worker;
  }
  worker = new Worker(new URL("./citation-worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener(
    "message",
    (event: MessageEvent<{ readonly id: number; readonly rendered: RenderedCitation }>) => {
      pending.get(event.data.id)?.(event.data.rendered);
      pending.delete(event.data.id);
    },
  );
  worker.addEventListener("error", () => {
    for (const resolve of pending.values()) {
      resolve({ kind: "failed" });
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  });
  return worker;
}

export function renderCitation(
  citation: CitationItem,
  style: string,
  locale: string,
): Promise<RenderedCitation> {
  const activeWorker = preloadCitations();
  const id = ++sequence;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    activeWorker.postMessage({ id, citation, style, locale });
  });
}
