/**
 * Whether Reader's side panel is showing a tab. The panel belongs to a window and follows
 * its active tab, drawing that tab's saved highlights itself (see use-page-capture.ts), so
 * the worker then only sets the badge. A tab in the background is drawn by the worker; the
 * panel redraws it, harmlessly, when the reader switches to it. Chrome knows which panel
 * documents exist, so nothing has to be announced: a port from the panel would not survive
 * the worker being stopped, and reconnecting it would keep waking the worker.
 */
const sidePanel = "SIDE_PANEL" as chrome.runtime.ContextType;

export async function panelShowsTab(tabId: number): Promise<boolean> {
  try {
    const [tab, contexts] = await Promise.all([
      chrome.tabs.get(tabId),
      chrome.runtime.getContexts({ contextTypes: [sidePanel] }),
    ]);
    return tab.active && contexts.some((context) => context.windowId === tab.windowId);
  } catch {
    return false;
  }
}
