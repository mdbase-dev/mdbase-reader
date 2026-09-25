import "@mdbase-reader/ui/styles.css";
import { createRoot } from "react-dom/client";

import { credentiallessFetch } from "./credentialless-fetch.js";
import "./extension.css";

/** Starts one extension page. Its fetches use signed grants, never ambient portal cookies. */
export function mount(page: React.JSX.Element): void {
  globalThis.fetch = credentiallessFetch(globalThis.fetch.bind(globalThis));
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Reader extension root is missing.");
  }
  createRoot(root).render(page);
}
