/**
 * Opt-in: on HTTPS pages already saved in the selected collection, show a toolbar badge
 * and draw the saved highlights. It needs the optional `https://*\/*` host permission,
 * which is requested only from this setting and removed when it is turned off.
 */
import { clearAllPageMarks } from "./page-badge.js";

export const pageStatusOrigins = ["https://*/*"];
const settingKey = "page-status";

export async function pageStatusEnabled(): Promise<boolean> {
  const [{ [settingKey]: setting }, granted] = await Promise.all([
    chrome.storage.local.get(settingKey),
    chrome.permissions.contains({ origins: pageStatusOrigins }),
  ]);
  return setting === true && granted;
}

/** Must be called directly from a user gesture: Chrome only shows the prompt then. */
export async function setPageStatusEnabled(enabled: boolean): Promise<boolean> {
  if (enabled) {
    const granted = await chrome.permissions.request({ origins: pageStatusOrigins });
    if (!granted) {
      return false;
    }
  } else {
    await chrome.permissions.remove({ origins: pageStatusOrigins });
  }
  await chrome.storage.local.set({ [settingKey]: enabled });
  if (!enabled) {
    await clearAllPageMarks().catch(() => undefined);
  }
  return enabled;
}

let cached: Promise<boolean> | null = null;
let watchingCache = false;

/**
 * {@link pageStatusEnabled} for the service worker, which asks on every page load: it
 * reads the setting once per worker lifetime and only asks for the permission when the
 * setting is on. Changes made while the worker runs reset it; a new worker starts afresh.
 */
export function pageStatusEnabledCached(): Promise<boolean> {
  if (!watchingCache) {
    watchingCache = true;
    const reset = (): void => {
      cached = null;
    };
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && settingKey in changes) {
        reset();
      }
    });
    chrome.permissions.onAdded.addListener(reset);
    chrome.permissions.onRemoved.addListener(reset);
  }
  cached ??= chrome.storage.local
    .get(settingKey)
    .then(({ [settingKey]: setting }) =>
      setting === true ? chrome.permissions.contains({ origins: pageStatusOrigins }) : false,
    )
    .catch(() => {
      cached = null;
      return false;
    });
  return cached;
}

/** For tests: forget the cached setting and its listeners. */
export function resetPageStatusCache(): void {
  cached = null;
  watchingCache = false;
}

/** Calls `listener` with the current setting now and whenever it is turned on or off. */
export function watchPageStatus(listener: (enabled: boolean) => void): () => void {
  let active = true;
  const check = (): void => {
    pageStatusEnabled()
      .then((enabled) => {
        if (active) {
          listener(enabled);
        }
      })
      .catch(() => undefined);
  };
  const onChanged = (changes: Record<string, unknown>, area: string): void => {
    if (area === "local" && settingKey in changes) {
      check();
    }
  };
  check();
  chrome.storage.onChanged.addListener(onChanged);
  return () => {
    active = false;
    chrome.storage.onChanged.removeListener(onChanged);
  };
}
