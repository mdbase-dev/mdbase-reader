import { updatePageStatus } from "./background-page-status.js";
import { credentiallessFetch } from "./credentialless-fetch.js";
import {
  capturePanelPath,
  intentKey,
  isExtensionMessage,
  type CaptureIntent,
  type InvokeMessage,
} from "./messages.js";

// The extension uses signed grants, never ambient portal cookies.
globalThis.fetch = credentiallessFetch(globalThis.fetch.bind(globalThis));

/**
 * Opens Reader's side panel for one tab. Everything here starts synchronously inside the
 * user gesture: Chrome only allows `sidePanel.open` from one, and the gesture also grants
 * `activeTab` for this tab.
 */
function openPanel(tab: chrome.tabs.Tab | undefined, intent: CaptureIntent): void {
  const tabId = tab?.id;
  if (tabId === undefined) {
    return;
  }
  void chrome.sidePanel.setOptions({ tabId, path: capturePanelPath(tabId), enabled: true });
  void chrome.sidePanel.open({ tabId }).catch(() => undefined);
  void chrome.storage.session.set({ [intentKey(tabId)]: intent }).catch(() => undefined);
  // An already open panel acts on this at once; a new one reads the stored intent.
  const message: InvokeMessage = { type: "mdbase-reader/invoke", tabId, intent };
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

chrome.action.onClicked.addListener((tab) => openPanel(tab, "capture"));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "save-highlight") {
    openPanel(tab, "highlight");
  }
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "highlight",
      title: "Save highlight to mdbase Reader",
      contexts: ["selection"],
      documentUrlPatterns: ["https://*/*"],
    });
    chrome.contextMenus.create({
      id: "note",
      title: "Highlight with a comment in mdbase Reader",
      contexts: ["selection"],
      documentUrlPatterns: ["https://*/*"],
    });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "highlight" || info.menuItemId === "note") {
    openPanel(tab, info.menuItemId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === "complete" && tab.url?.startsWith("https://")) {
    void updatePageStatus(tabId, tab.url);
  }
});
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isExtensionMessage(message) && message.type === "mdbase-reader/source-changed") {
    void chrome.tabs
      .get(message.tabId)
      .then((tab) => (tab.url ? updatePageStatus(message.tabId, tab.url) : undefined))
      .catch(() => undefined);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  // Drafts belong to a tab; free them when it closes.
  void chrome.storage.session
    .get(null)
    .then((values) =>
      chrome.storage.session.remove(
        Object.keys(values).filter(
          (key) => key.startsWith(`draft:${String(tabId)}:`) || key === intentKey(tabId),
        ),
      ),
    )
    .catch(() => undefined);
});
