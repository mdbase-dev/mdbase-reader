import { environment } from "./environment.js";

/**
 * Whether a URL is one of Reader's own pages: the Reader app in any environment, or one of
 * this extension's pages. There is nothing on them to save.
 */
export function isReaderPage(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  let origin: string;
  try {
    // Not `origin`: outside Chrome, a chrome-extension: URL's origin is opaque ("null").
    const { protocol, host } = new URL(url);
    origin = `${protocol}//${host}`;
  } catch {
    return false;
  }
  // The panel's own origin covers an unpacked build whose ID this build does not declare.
  const own =
    typeof location !== "undefined" && location.protocol === "chrome-extension:"
      ? [`${location.protocol}//${location.host}`]
      : [];
  return [...environment.readerOrigins, ...environment.extensionOrigins, ...own].includes(origin);
}
