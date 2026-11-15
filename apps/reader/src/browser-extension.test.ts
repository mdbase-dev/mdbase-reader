import { describe, expect, it } from "vitest";

import { readerExtensionOnDesktop, readerExtensionStoreUrl } from "./browser-extension.js";

describe("browser extension availability", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", 0, true],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/130.0", 0, true],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", 10, true],
    ["Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0", 0, true],
    ["Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile", 5, false],
    ["Mozilla/5.0 (Linux; Android 14) Chrome/130.0", 5, false],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) CriOS/130.0", 5, false],
    ["Mozilla/5.0 (iPad; CPU OS 18_0) Safari/605.1", 5, false],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1", 5, false],
  ])(
    "offers desktop guidance for %s with %s touch points: %s",
    (userAgent, maxTouchPoints, desktop) => {
      expect(readerExtensionOnDesktop({ userAgent, maxTouchPoints })).toBe(desktop);
    },
  );

  it("uses the existing Reader Chrome Web Store listing", () => {
    expect(readerExtensionStoreUrl).toBe(
      "https://chromewebstore.google.com/detail/mdbase-reader/kimdfjefhbfgfecconmaiaaindjccidp",
    );
  });

  it("does not offer installation without a browser", () => {
    expect(readerExtensionOnDesktop(null)).toBe(false);
  });
});
