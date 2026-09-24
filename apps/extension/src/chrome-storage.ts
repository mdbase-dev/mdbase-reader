/**
 * The Connect SDK needs a synchronous Web Storage, but the service worker has no
 * localStorage and must see the same grants as the side panel. This mirror loads
 * `chrome.storage.local` once, answers synchronously, writes through, and follows
 * changes made by other extension contexts.
 */
const prefix = "connect:";

export async function chromeStorageMirror(
  area: chrome.storage.StorageArea = chrome.storage.local,
): Promise<Storage> {
  const values = new Map<string, string>();
  const stored = await area.get(null);
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith(prefix) && typeof value === "string") {
      values.set(key.slice(prefix.length), value);
    }
  }
  chrome.storage.onChanged.addListener((changes, name) => {
    if (area !== chrome.storage[name as "local"]) {
      return;
    }
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      if (typeof change.newValue === "string") {
        values.set(key.slice(prefix.length), change.newValue);
      } else {
        values.delete(key.slice(prefix.length));
      }
    }
  });
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
