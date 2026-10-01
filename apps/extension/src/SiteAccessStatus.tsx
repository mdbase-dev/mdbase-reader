import { useEffect, useState } from "react";

import { pageStatusEnabled, pageStatusOrigins } from "./page-status.js";

/**
 * Whether Reader may read the pages the reader visits. The manifest asks for it, but Chrome
 * lets the reader limit site access; then the panel cannot follow tabs or mark saved pages.
 */
export function SiteAccessStatus(): React.JSX.Element {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    const check = (): void => {
      pageStatusEnabled()
        .then(setGranted)
        .catch(() => setGranted(false));
    };
    check();
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    return () => {
      chrome.permissions.onAdded.removeListener(check);
      chrome.permissions.onRemoved.removeListener(check);
    };
  }, []);
  if (granted === null) {
    return <p className="hint">Checking site access…</p>;
  }
  return granted ? (
    <p className="hint">
      The side panel follows the tab you are on, and pages you have saved show a mark and your
      highlights. Reader looks up each page’s address in your selected collection and reads page
      text only to draw your highlights.
    </p>
  ) : (
    <>
      <p className="hint">
        Site access is limited in Chrome, so the side panel cannot follow your tabs and saved pages
        are not marked. Press the toolbar button on a page to use Reader there.
      </p>
      <button
        type="button"
        className="secondary compact"
        onClick={() => {
          // Straight from the click: Chrome shows its prompt only during a user gesture.
          void chrome.permissions.request({ origins: pageStatusOrigins }).catch(() => false);
        }}
      >
        Allow on all sites
      </button>
    </>
  );
}
