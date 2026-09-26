import "@mdbase-reader/ui/styles.css";
import { createRoot } from "react-dom/client";

import { credentiallessFetch } from "./credentialless-fetch.js";
import { localResetPending } from "./local-reset.js";
import "./extension.css";

/** Starts one extension page. Its fetches use signed grants, never ambient portal cookies. */
export function mount(page: React.JSX.Element): void {
  globalThis.fetch = credentiallessFetch(globalThis.fetch.bind(globalThis));
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Reader extension root is missing.");
  }
  const renderer = createRoot(root);
  void localResetPending()
    .then((pending) => {
      renderer.render(
        pending ? (
          <main className="extension-page">
            <h1>Local cleanup pending</h1>
            <p>
              Reader is disconnected while local data is cleared. If this page remains, close other
              Reader extension pages and retry. Collection data is not deleted.
            </p>
            <button type="button" onClick={() => chrome.runtime.reload()}>
              Retry cleanup
            </button>
          </main>
        ) : (
          page
        ),
      );
    })
    .catch(() => {
      renderer.render(
        <p role="alert">Reader could not check local storage. Reload the extension to retry.</p>,
      );
    });
}
