import { vi } from "vitest";

type Listener = (...args: never[]) => unknown;

/** A small in-memory stand-in for the extension APIs these modules use. */
export function fakeChrome(): {
  chrome: typeof chrome;
  local: Map<string, unknown>;
  session: Map<string, unknown>;
  emit: (event: "message" | "updated" | "storage", ...args: unknown[]) => void;
} {
  const local = new Map<string, unknown>();
  const session = new Map<string, unknown>();
  const listeners = {
    message: new Set<Listener>(),
    updated: new Set<Listener>(),
    storage: new Set<Listener>(),
  };
  const area = (values: Map<string, unknown>, name: string): chrome.storage.StorageArea =>
    ({
      get: vi.fn((keys: string | string[] | null) => {
        const wanted = keys === null ? [...values.keys()] : Array.isArray(keys) ? keys : [keys];
        return Promise.resolve(
          Object.fromEntries(
            wanted.filter((key) => values.has(key)).map((key) => [key, values.get(key)]),
          ),
        );
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        const changes: Record<string, { newValue?: unknown; oldValue?: unknown }> = {};
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { newValue: value, oldValue: values.get(key) };
          values.set(key, value);
        }
        listeners.storage.forEach((listener) =>
          (listener as (...a: unknown[]) => void)(changes, name),
        );
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          values.delete(key);
        }
        return Promise.resolve();
      }),
    }) as unknown as chrome.storage.StorageArea;
  const event = (set: Set<Listener>): unknown => ({
    addListener: (listener: Listener) => set.add(listener),
    removeListener: (listener: Listener) => set.delete(listener),
  });
  const storage = {
    local: area(local, "local"),
    session: area(session, "session"),
    onChanged: event(listeners.storage),
  };
  const fake = {
    storage,
    runtime: { onMessage: event(listeners.message), sendMessage: vi.fn(() => Promise.resolve()) },
    tabs: { onUpdated: event(listeners.updated), get: vi.fn(), create: vi.fn() },
    scripting: { executeScript: vi.fn() },
    action: {
      setBadgeText: vi.fn(() => Promise.resolve()),
      setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
      setTitle: vi.fn(() => Promise.resolve()),
    },
    permissions: {
      contains: vi.fn(() => Promise.resolve(false)),
      request: vi.fn(() => Promise.resolve(true)),
      remove: vi.fn(() => Promise.resolve(true)),
      onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  } as unknown as typeof chrome;
  return {
    chrome: fake,
    local,
    session,
    emit: (name, ...args) => {
      listeners[name].forEach((listener) => (listener as (...a: unknown[]) => void)(...args));
    },
  };
}
