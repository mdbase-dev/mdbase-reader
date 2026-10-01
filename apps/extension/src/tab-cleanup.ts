import { intentKey } from "./messages.js";
import { forgetPageMark } from "./page-badge.js";

/**
 * Frees what belonged to a closed tab: its drafts (`draft:<tab>:<page>`, see drafts.ts),
 * a pending intent and its page mark. Only key names are read where Chrome can list them
 * (`getKeys`, Chrome 130); older versions read the whole session area as before.
 */
export async function forgetTab(tabId: number): Promise<void> {
  const area = chrome.storage.session;
  const keys =
    "getKeys" in area && typeof area.getKeys === "function"
      ? await area.getKeys()
      : Object.keys(await area.get(null));
  const draftPrefix = `draft:${String(tabId)}:`;
  const intent = intentKey(tabId);
  const owned = keys.filter((key) => key.startsWith(draftPrefix) || key === intent);
  await Promise.all([owned.length ? area.remove(owned) : undefined, forgetPageMark(tabId)]);
}
