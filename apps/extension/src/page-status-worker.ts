import { credentiallessFetch } from "./credentialless-fetch.js";
import { pageStatusConnect } from "./page-status-connect.js";
import { definePageStatusConnect } from "./page-status-loader.js";

// The entry of page-status.js, loaded into the service worker on demand (see
// page-status-loader.ts). Running it twice in one worker must change nothing.
if (definePageStatusConnect(pageStatusConnect)) {
  // The extension uses signed grants, never ambient portal cookies.
  globalThis.fetch = credentiallessFetch(globalThis.fetch.bind(globalThis));
}
