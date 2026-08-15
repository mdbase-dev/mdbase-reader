chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) {
    return;
  }
  const url = new URL(chrome.runtime.getURL("capture.html"));
  url.searchParams.set("tab", String(tab.id));
  void chrome.windows.create({
    url: url.href,
    type: "popup",
    width: 430,
    height: 650,
    focused: true,
  });
});
