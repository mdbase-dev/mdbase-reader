// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readerExtensionStoreUrl } from "./browser-extension.js";
import { BrowserExtensionDiscovery, BrowserExtensionLink } from "./BrowserExtensionHelp.js";
import { renderToStaticMarkup } from "./testing/i18n.js";

beforeEach(() => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("browser extension discovery", () => {
  it.each(["add-source", "empty-library"] as const)(
    "explains the optional capture workflow in %s",
    (placement) => {
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(<BrowserExtensionDiscovery placement={placement} />);
      expect(host.querySelector(placement === "add-source" ? "h3" : "h2")?.textContent).toBe(
        "Save from your browser",
      );
      expect(host.textContent).toContain("optional Chrome extension");
      const link = host.querySelector("a");
      expect(link?.textContent).toBe("Get Chrome extension");
      expect(link?.href).toBe(readerExtensionStoreUrl);
      expect(link?.target).toBe("_blank");
      expect(link?.rel).toBe("noopener noreferrer");
      expect(host.querySelector("button, dialog, [role=alert]")).toBeNull();
    },
  );

  it("explains desktop availability on mobile without offering an installation button", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 14) Mobile",
    );
    const html = renderToStaticMarkup(<BrowserExtensionLink />);
    expect(html).toContain("Available in Chrome on a computer.");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("Get Chrome extension");
  });
});
