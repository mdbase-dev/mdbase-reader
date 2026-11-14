import { credentiallessFetch } from "./credentialless-fetch.js";

// Reader's own fetches keep omitting portal cookies in the module service worker.
globalThis.fetch = credentiallessFetch(globalThis.fetch.bind(globalThis));

export { pageStatusConnect } from "./page-status-connect.js";
