import { createRoot } from "react-dom/client";

import { tabIdParameter } from "./capture-model.js";
import { CaptureApp } from "./CaptureApp.js";
import { credentiallessFetch } from "./credentialless-fetch.js";
import "./extension.css";
import { useExtensionCapture } from "./use-extension-capture.js";

// The extension uses signed grants, never ambient portal cookies.
globalThis.fetch = credentiallessFetch(globalThis.fetch.bind(globalThis));

function App(): React.JSX.Element {
  return <CaptureApp controller={useExtensionCapture(tabIdParameter())} />;
}
const root = document.getElementById("root");
if (!root) {
  throw new Error("Reader extension root is missing.");
}
createRoot(root).render(<App />);
