/**
 * Opt-in: on HTTPS pages already saved in the selected collection, show a toolbar badge
 * and draw the saved highlights. It needs the optional `https://*\/*` host permission,
 * which is requested only from this setting and removed when it is turned off.
 */
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
  return enabled;
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
