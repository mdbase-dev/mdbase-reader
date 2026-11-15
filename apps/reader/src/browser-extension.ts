export const readerExtensionStoreUrl =
  "https://chromewebstore.google.com/detail/mdbase-reader/kimdfjefhbfgfecconmaiaaindjccidp";

export function readerExtensionOnDesktop(
  browser: Pick<Navigator, "userAgent" | "maxTouchPoints"> | null = typeof navigator === "undefined"
    ? null
    : navigator,
): boolean {
  if (!browser) {
    return false;
  }
  return (
    !/Android|iPhone|iPad|iPod|Mobile/iu.test(browser.userAgent) &&
    !(browser.userAgent.includes("Macintosh") && browser.maxTouchPoints > 1)
  );
}

export class BrowserExtensionHintError extends Error {}
