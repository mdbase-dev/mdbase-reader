import { updatePageStatus } from "./background-page-status.js";
import { capturePanelPath, intentKey, type CaptureIntent, type InvokeMessage } from "./messages.js";
import { loadPageStatusConnect, preloadPageStatusConnect } from "./page-status-loader.js";
import { forgetTab } from "./tab-cleanup.js";

/*
 * The service worker wakes for every page load and toolbar click, so this bundle stays
 * small: the Connect SDK lives in page-status.js, loaded only when a page may be saved
 * (see page-status-loader.ts). Connect's credentialless fetch is installed there.
 */
self.addEventListener("install", preloadPageStatusConnect);

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
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") }).catch(() => undefined);
  }
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
  if (change.status === "complete") {
    void updatePageStatus(tabId, tab.url, loadPageStatusConnect);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  // Drafts belong to a tab; free them when it closes.
  void forgetTab(tabId).catch(() => undefined);
});
