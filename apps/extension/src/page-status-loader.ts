import type { PageStatusConnect } from "./page-status-connect.js";

/**
 * The service worker is a classic script so that the Connect SDK (most of its code) can
 * stay out of every wake-up: toolbar clicks, shortcuts and most page loads never need
 * it. Chrome only lets a service worker `importScripts()` a file after installation if
 * it was imported while installing, so the worker imports it once from `install`
 * ({@link preloadPageStatusConnect}) and again, on demand, when a page needs Connect.
 */
export const pageStatusScript = "page-status.js";
const globalName = "mdbaseReaderPageStatus";

interface WorkerGlobal {
  importScripts?: (...urls: string[]) => void;
  [globalName]?: PageStatusConnect;
}

/** Called by page-status.js when it runs; the first definition wins. */
export function definePageStatusConnect(connect: PageStatusConnect): boolean {
  const scope = globalThis as WorkerGlobal;
  if (scope[globalName]) {
    return false;
  }
  scope[globalName] = connect;
  return true;
}

/** Loads page-status.js into this worker on first use. Throws when it cannot be loaded. */
export function loadPageStatusConnect(): PageStatusConnect {
  const scope = globalThis as WorkerGlobal;
  if (!scope[globalName]) {
    if (!scope.importScripts) {
      throw new Error("The page status bundle can only be loaded by the service worker.");
    }
    scope.importScripts(pageStatusScript);
  }
  const connect = scope[globalName];
  if (!connect) {
    throw new Error(`${pageStatusScript} did not define page status.`);
  }
  return connect;
}

/** From the worker's `install` event: registers page-status.js for later on-demand loads. */
export function preloadPageStatusConnect(): void {
  try {
    loadPageStatusConnect();
  } catch {
    // Page status then stays unavailable until the next install; capture is unaffected.
  }
}
