import { tabIdParameter } from "./capture-model.js";
import { CaptureApp } from "./CaptureApp.js";
import { mount } from "./mount.js";
import { useExtensionCapture } from "./use-extension-capture.js";

function App(): React.JSX.Element {
  return <CaptureApp controller={useExtensionCapture(tabIdParameter())} />;
}
mount(<App />);
