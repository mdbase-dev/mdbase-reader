/**
 * The Connect SDK needs a synchronous Web Storage, but the service worker has no
 * localStorage and must see the same grants as the side panel. This mirror loads
 * `chrome.storage.local` once, answers synchronously, writes through, and follows
 * changes made by other extension contexts.
 *
 * There is one mirror per storage area and context: every Connect session in it (a
 * Retry creates a new one) shares it, so only one `storage.onChanged` listener exists.
 */
const prefix = "connect:";

const mirrors = new WeakMap<chrome.storage.StorageArea, Promise<Storage>>();

export function chromeStorageMirror(
  area: chrome.storage.StorageArea = chrome.storage.local,
): Promise<Storage> {
  let mirror = mirrors.get(area);
  if (!mirror) {
    mirror = createMirror(area);
    mirrors.set(area, mirror);
    // A failed load is retried by the next caller rather than remembered.
    mirror.catch(() => mirrors.delete(area));
  }
  return mirror;
}

async function createMirror(area: chrome.storage.StorageArea): Promise<Storage> {
  const values = new Map<string, string>();
  // Listen before loading, so a change made meanwhile is not overwritten by the load.
  const changedDuringLoad = new Set<string>();
  let loading = true;
  const follow = (changes: Record<string, chrome.storage.StorageChange>, name: string): void => {
    if (area !== chrome.storage[name as "local"]) {
      return;
    }
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      if (loading) {
        changedDuringLoad.add(key);
      }
      if (typeof change.newValue === "string") {
        values.set(key.slice(prefix.length), change.newValue);
      } else {
        values.delete(key.slice(prefix.length));
      }
    }
  };
  chrome.storage.onChanged.addListener(follow);
  let stored: Record<string, unknown>;
  try {
    stored = await loadPrefixed(area);
  } catch (error) {
    chrome.storage.onChanged.removeListener(follow);
    throw error;
  }
  loading = false;
  for (const [key, value] of Object.entries(stored)) {
    if (!changedDuringLoad.has(key) && key.startsWith(prefix) && typeof value === "string") {
      values.set(key.slice(prefix.length), value);
    }
  }
  const write = (key: string, value: string | null): void => {
    // Persisting is asynchronous; a failure must not break the synchronous SDK call.
    const done = value === null ? area.remove(prefix + key) : area.set({ [prefix + key]: value });
    void done.catch(() => undefined);
  };
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
      write(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
      write(key, null);
    },
    clear: () => {
      for (const key of values.keys()) {
        write(key, null);
      }
      values.clear();
    },
  };
}

/** Reads only Connect's keys where Chrome can list key names (`getKeys`, Chrome 130). */
async function loadPrefixed(area: chrome.storage.StorageArea): Promise<Record<string, unknown>> {
  if ("getKeys" in area && typeof area.getKeys === "function") {
    const keys = (await area.getKeys()).filter((key) => key.startsWith(prefix));
    return keys.length ? area.get(keys) : {};
  }
  return area.get(null);
}
