import { useEffect, useState } from "react";

/**
 * The active tab of the window the side panel belongs to, following tab switches. Tab
 * IDs and activation need no permission; the page itself is read separately.
 */
export function useActiveTab(): number | null {
  const [tabId, setTabId] = useState<number | null>(null);
  useEffect(() => {
    let windowId: number | undefined;
    let mounted = true;
    const onActivated = (info: chrome.tabs.OnActivatedInfo): void => {
      if (info.windowId === windowId) {
        setTabId(info.tabId);
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    void chrome.windows
      .getCurrent()
      .then(async (window) => {
        windowId = window.id;
        const [tab] = await chrome.tabs.query({ active: true, windowId });
        if (mounted && tab?.id !== undefined) {
          setTabId(tab.id);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, []);
  return tabId;
}
