import { environment } from "./environment.js";

const resetKey = "reader-local-reset-pending";

export async function localResetPending(): Promise<boolean> {
  return (await chrome.storage.local.get(resetKey))[resetKey] === true;
}

/** Reload first: terminate active SDK sessions/writes before clearing their state. */
export async function requestLocalReset(): Promise<void> {
  await chrome.storage.local.set({ [resetKey]: true });
  chrome.runtime.reload();
}

/** Only the freshly started service worker may finish a reset. No network calls. */
export async function finishLocalReset(): Promise<boolean> {
  if (!(await localResetPending())) {
    return false;
  }
  const local = new URL(environment.loopbackUrl);
  await chrome.permissions.remove({
    origins: ["https://*/*", `${local.protocol}//${local.hostname}/*`],
  });
  // SDK signing keys and application identity live in extension-origin IndexedDB,
  // not chrome.storage.local. Fail closed if a database remains open.
  for (const database of await indexedDB.databases()) {
    const name = database.name;
    if (!name) {
      continue;
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Could not clear local credentials."));
      request.onblocked = () => reject(new Error("Close other Reader extension pages and retry."));
    });
  }
  await chrome.storage.session.clear();
  // Last operation: on failure/restart the marker survives and prevents sessions
  // from starting. A retry can safely repeat any completed cleanup steps.
  await chrome.storage.local.clear();
  return true;
}
