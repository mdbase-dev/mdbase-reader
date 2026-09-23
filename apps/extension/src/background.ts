function openCapture(tab: chrome.tabs.Tab | undefined, intent = "capture"): void {
  if (tab?.id === undefined) {
    return;
  }
  const url = new URL(chrome.runtime.getURL("capture.html"));
  url.searchParams.set("tab", String(tab.id));
  url.searchParams.set("intent", intent);
  void chrome.windows.create({
    url: url.href,
    type: "popup",
    width: 440,
    height: 760,
    focused: true,
  });
}

chrome.action.onClicked.addListener((tab) => openCapture(tab));
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
      title: "Add a note in mdbase Reader",
      contexts: ["selection"],
      documentUrlPatterns: ["https://*/*"],
    });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "highlight" || info.menuItemId === "note") {
    openCapture(tab, info.menuItemId);
  }
});
