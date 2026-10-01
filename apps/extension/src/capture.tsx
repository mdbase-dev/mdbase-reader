import { useActiveTab } from "./active-tab.js";
import { CaptureApp } from "./CaptureApp.js";
import { mount } from "./mount.js";
import { usePanelConnection, type PanelConnection } from "./panel-connection.js";
import { useExtensionCapture } from "./use-extension-capture.js";

/** One panel per window: it shows whichever tab is active, with one Connect session. */
function App(): React.JSX.Element | null {
  const link = usePanelConnection();
  const tabId = useActiveTab();
  // Each tab starts fresh; its unsaved text comes back from session storage.
  return tabId === null ? null : <TabCapture key={tabId} tabId={tabId} link={link} />;
}

function TabCapture({
  tabId,
  link,
}: {
  readonly tabId: number;
  readonly link: PanelConnection;
}): React.JSX.Element {
  return <CaptureApp controller={useExtensionCapture(tabId, link)} />;
}

mount(<App />);
