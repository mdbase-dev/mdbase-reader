/**
 * Whether Reader's side panel is open for a tab. An open panel follows its tab and draws
 * the saved highlights itself (see use-page-capture.ts), so the worker then only sets the
 * badge. Chrome knows which panel documents exist, so nothing has to be announced: a
 * port from the panel would not survive the worker being stopped, and reconnecting it
 * would keep waking the worker.
 */
const sidePanel = "SIDE_PANEL" as chrome.runtime.ContextType;

export async function panelShowsTab(tabId: number): Promise<boolean> {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [sidePanel] });
    return contexts.some((context) => panelTab(context.documentUrl) === tabId);
  } catch {
    return false;
  }
}

function panelTab(documentUrl: string | undefined): number | null {
  if (!documentUrl) {
    return null;
  }
  try {
    const value = Number.parseInt(new URL(documentUrl).searchParams.get("tab") ?? "", 10);
    return Number.isInteger(value) ? value : null;
  } catch {
    return null;
  }
}
