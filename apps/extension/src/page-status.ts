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
